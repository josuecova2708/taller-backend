import { DtcType } from '@prisma/client';

/**
 * Días después de cerrar una orden como completada durante los cuales un
 * código PERMANENTE con monitores incompletos se considera esperable.
 *
 * Tras una reparación, la ECU conserva el código permanente hasta completar
 * sus ciclos de verificación, lo que puede llevar varios días de uso. Sin esta
 * regla, el primer escaneo después de reparar volvía a abrir una orden.
 */
export const DIAS_GRACIA_TRAS_REPARACION = 15;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * El escaneo tiene la forma típica de un vehículo recién reparado: solo
 * códigos PERMANENTES (ninguno CONFIRMADO ni PENDIENTE) y monitores sin
 * completar. Un escaneo sin códigos no cuenta: ese ya no abre orden.
 *
 * Función pura, sin Nest ni Prisma, para probarla sola.
 */
export function pareceSecuelaDeReparacion(
  dtcs: ReadonlyArray<{ type: string }>,
  monitorsCompleted: boolean | undefined,
): boolean {
  if (dtcs.length === 0) return false;
  if (monitorsCompleted !== false) return false;
  return dtcs.every((d) => d.type === DtcType.PERMANENT);
}

/** Desde qué fecha una reparación cuenta como reciente. */
export function inicioVentanaReparacion(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - DIAS_GRACIA_TRAS_REPARACION * DIA_MS);
}

/** Dictamen que se registra en lugar de abrir una orden. */
export function dictamenSecuelaDeReparacion(
  codigos: string[],
  cierre: Date,
  monitoresIncompletos: string[],
): string {
  const fecha = cierre.toISOString().slice(0, 10);
  return (
    `Código(s) PERMANENTE(S) (${codigos.join(', ')}) con monitores OBD incompletos ` +
    `(${monitoresIncompletos.join(', ') || 'en recalibración'}), ` +
    `después de una reparación registrada el ${fecha}. Es esperable tras una ` +
    'reparación reciente: la ECU mantiene el código hasta completar sus ciclos de ' +
    `verificación. No se abre una orden nueva; se deja en seguimiento (ALERT). ` +
    'Vuelva a escanear el vehículo cuando los monitores estén completos.'
  );
}
