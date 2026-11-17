import { VehicleStatus } from '@prisma/client';

/** Estados de vehículo ordenados de menos a más grave. */
export const ORDEN_ESTADOS: VehicleStatus[] = [
  VehicleStatus.OK,
  VehicleStatus.ALERT,
  VehicleStatus.CRITICAL,
];

/**
 * Decide el estado del vehículo sin borrar una condición sin resolver.
 *
 * Antes se escribía directamente el resultado del último escaneo. Eso hacía
 * que un escaneo limpio devolviera a OK un vehículo con una orden crítica
 * abierta y la falla sin reparar: basta con que alguien borre los códigos o
 * desconecte la batería. Con una orden abierta, el estado no puede bajar; se
 * conserva el más grave entre el calculado y el actual.
 *
 * Cerrar la orden como completada es una decisión humana (permiso
 * `order:close`, del mecánico que la atendió o del administrador), y es ahí
 * donde el vehículo vuelve a OK.
 *
 * Vive en su propio archivo, sin decoradores ni inyección, para poder probarse
 * sin arrastrar el grafo de dependencias de `ScansService` (que llega hasta el
 * SDK de Anthropic).
 */
export function resolverEstadoVehiculo(
  calculado: VehicleStatus,
  actual: VehicleStatus,
  tieneOrdenesAbiertas: boolean,
): VehicleStatus {
  if (!tieneOrdenesAbiertas) {
    return calculado;
  }

  return ORDEN_ESTADOS.indexOf(calculado) >= ORDEN_ESTADOS.indexOf(actual)
    ? calculado
    : actual;
}
