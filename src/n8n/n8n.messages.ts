/**
 * Textos y datos que el backend entrega a n8n.
 *
 * Son funciones puras, sin Nest ni Prisma, para poder probarlas solas. El
 * mensaje ya va redactado: así los flujos de n8n solo deciden por qué canal
 * sale (Telegram, correo) y no hay que mantener el texto en dos lugares.
 */

/** Días sin escaneo a partir de los cuales un vehículo figura como atrasado. */
export const DIAS_SIN_ESCANEO = 30;

const DIA_MS = 24 * 60 * 60 * 1000;

const PRIORIDAD: Record<string, string> = {
  LOW: 'baja',
  MEDIUM: 'media',
  HIGH: 'alta',
  CRITICAL: 'crítica',
};

const ESTADO_ORDEN: Record<string, string> = {
  OPEN: 'abierta',
  IN_PROGRESS: 'en proceso',
  COMPLETED: 'completada',
  CANCELLED: 'cancelada',
};

/** Lo más urgente primero. */
const ORDEN_PRIORIDAD = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** Responsable del vehículo, tal como lo leen los avisos. */
export type Responsable = { name: string } | null | undefined;

export interface OrdenParaAviso {
  id: string;
  scanId?: string;
  priority: string;
  status: string;
  description: string;
  createdAt: Date;
  vehicle: { plate: string; alias: string | null; responsible?: Responsable };
  assignedTo?: { name: string } | null;
  scan?: { dtcEntries: Array<{ code: string }> } | null;
}

export interface VehiculoParaResumen {
  plate: string;
  alias: string | null;
  responsible?: Responsable;
  scans: Array<{ scannedAt: Date }>;
}

/** Texto que se usa cuando el vehículo no tiene responsable. */
export const SIN_RESPONSABLE = 'sin responsable';

export function nombreResponsable(r: Responsable): string {
  return r?.name ?? SIN_RESPONSABLE;
}

export function textoPrioridad(priority: string): string {
  return PRIORIDAD[priority] ?? priority;
}

function nombreVehiculo(v: { plate: string; alias: string | null }): string {
  return v.alias ? `${v.plate} (${v.alias})` : v.plate;
}

function enlaceOrden(urlBase: string | undefined, id: string): string | null {
  if (!urlBase) return null;
  return `${urlBase.replace(/\/+$/, '')}/dashboard/work-orders/${id}`;
}

/** Aviso de una orden de trabajo recién creada (CU17). */
export function construirAlerta(orden: OrdenParaAviso, urlBase?: string) {
  const codigos = orden.scan?.dtcEntries.map((d) => d.code) ?? [];
  const enlace = enlaceOrden(urlBase, orden.id);
  const prioridad = PRIORIDAD[orden.priority] ?? orden.priority;

  const responsable = nombreResponsable(orden.vehicle.responsible);

  const lineas = [
    `Nueva orden de trabajo, prioridad ${prioridad}`,
    `Vehículo: ${nombreVehiculo(orden.vehicle)}`,
    `Responsable: ${responsable}`,
    codigos.length > 0 ? `Códigos de falla: ${codigos.join(', ')}` : null,
    `Motivo: ${orden.description}`,
    enlace ? `Ver la orden: ${enlace}` : null,
  ].filter(Boolean);

  return {
    evento: 'orden_creada' as const,
    asunto: `Orden de trabajo para ${orden.vehicle.plate} (prioridad ${prioridad})`,
    mensaje: lineas.join('\n'),
    orden: {
      id: orden.id,
      prioridad,
      descripcion: orden.description,
      creada: orden.createdAt.toISOString(),
      enlace,
    },
    vehiculo: {
      placa: orden.vehicle.plate,
      alias: orden.vehicle.alias,
      responsable: orden.vehicle.responsible?.name ?? null,
    },
    codigos,
  };
}

/** Resumen diario de órdenes sin cerrar y escaneos atrasados (CU19). */
export function construirResumen(
  ordenes: OrdenParaAviso[],
  vehiculos: VehiculoParaResumen[],
  ahora: Date,
  urlBase?: string,
) {
  const ordenadas = [...ordenes].sort(
    (a, b) =>
      ORDEN_PRIORIDAD.indexOf(a.priority) - ORDEN_PRIORIDAD.indexOf(b.priority) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const detalle = ordenadas.map((o) => ({
    id: o.id,
    placa: o.vehicle.plate,
    alias: o.vehicle.alias,
    prioridad: PRIORIDAD[o.priority] ?? o.priority,
    estado: ESTADO_ORDEN[o.status] ?? o.status,
    mecanico: o.assignedTo?.name ?? null,
    responsable: o.vehicle.responsible?.name ?? null,
    diasAbierta: Math.floor((ahora.getTime() - o.createdAt.getTime()) / DIA_MS),
  }));

  const atrasados = vehiculos
    .map((v) => {
      const ultimo = v.scans[0]?.scannedAt ?? null;
      const dias = ultimo
        ? Math.floor((ahora.getTime() - ultimo.getTime()) / DIA_MS)
        : null;
      return {
        placa: v.plate,
        alias: v.alias,
        responsable: v.responsible?.name ?? null,
        diasSinEscaneo: dias,
      };
    })
    .filter((v) => v.diasSinEscaneo === null || v.diasSinEscaneo >= DIAS_SIN_ESCANEO)
    // Los nunca escaneados primero; después, los más atrasados.
    .sort((a, b) => (b.diasSinEscaneo ?? Infinity) - (a.diasSinEscaneo ?? Infinity));

  const sinAsignar = detalle.filter((o) => !o.mecanico).length;
  const fecha = ahora.toLocaleDateString('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const lineas: string[] = [`Resumen de la flota UAGRM, ${fecha}`, ''];

  if (detalle.length === 0) {
    lineas.push('No hay órdenes de trabajo sin cerrar.');
  } else {
    lineas.push(
      `Órdenes de trabajo sin cerrar: ${detalle.length}` +
        (sinAsignar > 0 ? ` (${sinAsignar} sin mecánico asignado)` : ''),
    );
    for (const o of detalle) {
      const dias =
        o.diasAbierta === 0
          ? 'creada hoy'
          : `${o.diasAbierta} ${o.diasAbierta === 1 ? 'día' : 'días'}`;
      lineas.push(
        `- ${o.placa}: prioridad ${o.prioridad}, ${o.estado}, ` +
          `${o.mecanico ?? 'sin mecánico asignado'}, ${dias} ` +
          `(responsable: ${o.responsable ?? SIN_RESPONSABLE})`,
      );
    }
  }

  lineas.push('');
  if (atrasados.length === 0) {
    lineas.push(`Todos los vehículos se escanearon en los últimos ${DIAS_SIN_ESCANEO} días.`);
  } else {
    lineas.push(`Vehículos sin escaneo en ${DIAS_SIN_ESCANEO} días: ${atrasados.length}`);
    for (const v of atrasados) {
      lineas.push(
        `- ${v.placa}: ` +
          (v.diasSinEscaneo === null
            ? 'nunca fue escaneado'
            : `${v.diasSinEscaneo} días sin escaneo`) +
          ` (responsable: ${v.responsable ?? SIN_RESPONSABLE})`,
      );
    }
  }

  if (urlBase) {
    lineas.push('', `Ver la flota: ${urlBase.replace(/\/+$/, '')}/dashboard`);
  }

  return {
    fecha,
    asunto: `Resumen diario de la flota UAGRM (${fecha})`,
    mensaje: lineas.join('\n'),
    ordenesSinCerrar: detalle.length,
    ordenesSinAsignar: sinAsignar,
    ordenes: detalle,
    vehiculosSinEscaneo: atrasados,
  };
}
