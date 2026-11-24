/**
 * Texto del push y lectura de la clave de Firebase.
 *
 * Funciones puras, sin Nest ni Firebase, para poder probarlas solas.
 */
import { OrdenParaAviso, textoPrioridad } from '../n8n/n8n.messages';

/** Canal de Android en el que se muestran los avisos. Lo crea la app. */
export const CANAL_ALERTAS = 'alertas';

/** El cuerpo del push se corta: en la pantalla bloqueada caben pocas líneas. */
const LARGO_MAXIMO = 180;

export interface MensajePush {
  titulo: string;
  cuerpo: string;
  /** Datos para que la app sepa qué abrir. FCM solo admite textos. */
  datos: Record<string, string>;
}

function recortar(texto: string, maximo: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= maximo
    ? limpio
    : `${limpio.slice(0, maximo - 1).trimEnd()}…`;
}

/**
 * Push de una orden de trabajo nueva (CU18) para mecánicos y administradores:
 * invita a abrirla y tomarla. El cuerpo lleva el motivo resumido.
 */
export function construirPush(orden: OrdenParaAviso): MensajePush {
  const prioridad = textoPrioridad(orden.priority);

  return {
    // Título corto para que no lo corte la pantalla bloqueada; el cuerpo
    // completa la frase y agrega el motivo.
    titulo: `Nueva orden para ${orden.vehicle.plate} (prioridad ${prioridad}).`,
    cuerpo: recortar(`Ábrala para tomarla. ${orden.description}`, LARGO_MAXIMO),
    datos: {
      tipo: 'orden_creada',
      workOrderId: orden.id,
      placa: orden.vehicle.plate,
      prioridad: orden.priority,
    },
  };
}

/**
 * Push de una orden nueva para el responsable del vehículo.
 *
 * Lleva el escaneo y no la orden: el inspector no puede ver órdenes, pero sí
 * el escaneo y su hipótesis. Por eso el tipo es otro y no trae `workOrderId`.
 */
export function construirPushResponsable(orden: OrdenParaAviso): MensajePush {
  const vehiculo = orden.vehicle.alias
    ? `${orden.vehicle.plate} (${orden.vehicle.alias})`
    : orden.vehicle.plate;

  return {
    titulo: `Su vehículo ${orden.vehicle.plate} necesita revisión en el taller.`,
    cuerpo: recortar(`${vehiculo}: ${orden.description}`, LARGO_MAXIMO),
    datos: {
      tipo: 'vehiculo_requiere_revision',
      placa: orden.vehicle.plate,
      ...(orden.scanId ? { scanId: orden.scanId } : {}),
    },
  };
}

/** Lo mínimo de una orden cerrada para redactar su aviso. */
export interface OrdenCerrada {
  id: string;
  scanId?: string;
  status: string;
  vehicle: { plate: string };
  closedBy?: { name: string } | null;
}

/**
 * Push de una orden cerrada, para el responsable y los administradores.
 * Si se canceló, no dice que el vehículo vuelve a operar.
 */
export function construirPushCierre(orden: OrdenCerrada): MensajePush {
  const quien = orden.closedBy?.name ?? 'un usuario';
  const cancelada = orden.status === 'CANCELLED';

  return {
    titulo: cancelada
      ? `Orden de ${orden.vehicle.plate} cancelada`
      : `Orden de ${orden.vehicle.plate} cerrada`,
    cuerpo: cancelada
      ? `La orden de ${orden.vehicle.plate} fue cancelada por ${quien}. ` +
        'El estado del vehículo se mantiene según su último escaneo.'
      : `La orden de ${orden.vehicle.plate} fue cerrada por ${quien}. ` +
        'El vehículo vuelve a estar operativo.',
    datos: {
      tipo: 'orden_cerrada',
      placa: orden.vehicle.plate,
      estado: orden.status,
      ...(orden.scanId ? { scanId: orden.scanId } : {}),
    },
  };
}

export interface CuentaServicio {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Interpreta `FIREBASE_SERVICE_ACCOUNT`, que puede ser la ruta al archivo
 * .json, su contenido, o su contenido en base64.
 *
 * Lanza un error con un mensaje claro si el valor no sirve; nunca incluye el
 * valor en el mensaje, porque es un secreto.
 */
export function leerCuentaServicio(
  valor: string,
  leerArchivo: (ruta: string) => string,
): CuentaServicio {
  const crudo = valor.trim();
  let texto: string;

  if (crudo.startsWith('{')) {
    texto = crudo;
  } else if (/\.json$/i.test(crudo)) {
    try {
      texto = leerArchivo(crudo);
    } catch {
      throw new Error(
        'no se pudo leer el archivo indicado en FIREBASE_SERVICE_ACCOUNT',
      );
    }
  } else {
    texto = Buffer.from(crudo, 'base64').toString('utf8');
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(texto.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no contiene un JSON válido');
  }

  const projectId = json.project_id;
  const clientEmail = json.client_email;
  const privateKey = json.private_key;
  if (
    typeof projectId !== 'string' ||
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string'
  ) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT no es una clave de cuenta de servicio ' +
        '(faltan project_id, client_email o private_key)',
    );
  }

  // En una variable de entorno los saltos de línea suelen llegar escapados.
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}
