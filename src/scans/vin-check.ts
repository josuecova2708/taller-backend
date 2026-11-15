/** Longitud de un VIN completo (ISO 3779). */
const LARGO_VIN = 17;

export function normalizarVin(vin?: string | null): string | null {
  const limpio = vin?.trim().toUpperCase();
  return limpio ? limpio : null;
}

/**
 * ¿El VIN que reportó la ECU contradice al del vehículo elegido?
 *
 * El inspector puede elegir el vehículo a mano, y la ECU además reporta su
 * VIN. Si ambos existen y no coinciden, el escaneo se está registrando en el
 * vehículo equivocado: todo el historial y las órdenes quedarían mal
 * atribuidos, así que se rechaza.
 *
 * Solo se compara un VIN leído completo (17 caracteres): una lectura parcial
 * no alcanza para afirmar que es otro vehículo. Si el vehículo no tiene VIN
 * registrado tampoco hay contra qué comparar.
 */
export function vinEnConflicto(
  vinRegistrado?: string | null,
  vinLeido?: string | null,
): boolean {
  const registrado = normalizarVin(vinRegistrado);
  const leido = normalizarVin(vinLeido);

  if (!registrado || !leido) return false;
  if (leido.length !== LARGO_VIN) return false;

  return registrado !== leido;
}
