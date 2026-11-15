/**
 * Texto del push y lectura de la clave de Firebase.
 *
 * Funciones puras, sin Nest ni Firebase, para poder probarlas solas.
 */
import { construirAlerta, OrdenParaAviso } from '../n8n/n8n.messages';

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
 * Push de una orden de trabajo nueva (CU18): placa, prioridad y un resumen.
 * Toma la prioridad ya redactada del aviso por n8n para que digan lo mismo.
 */
export function construirPush(orden: OrdenParaAviso): MensajePush {
  const alerta = construirAlerta(orden);
  const vehiculo = orden.vehicle.alias
    ? `${orden.vehicle.plate} (${orden.vehicle.alias})`
    : orden.vehicle.plate;

  return {
    titulo: `${vehiculo}: orden de prioridad ${alerta.orden.prioridad}`,
    cuerpo: recortar(orden.description, LARGO_MAXIMO),
    datos: {
      tipo: 'orden_creada',
      workOrderId: orden.id,
      placa: orden.vehicle.plate,
      prioridad: orden.priority,
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
    json = JSON.parse(texto.replace(/^﻿/, ''));
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
