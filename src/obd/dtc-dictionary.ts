/**
 * Diccionario estático de códigos OBD-II: la capa determinística previa a la IA.
 *
 * Vive fuera de cualquier módulo de Nest a propósito. Es una consulta pura, sin
 * estado ni dependencias, y la necesitan tanto `ScansModule` (al listar
 * escaneos) como `DiagnosisModule` (al armar el prompt). Mantenerlo como
 * servicio inyectable dentro de `ScansModule` forzaba una dependencia circular
 * entre ambos módulos.
 *
 * Al ampliar esta tabla, preferir la redacción del manual de servicio del
 * fabricante antes que una traducción genérica: el texto va directo al prompt
 * y al informe que lee el mecánico.
 */
export const STATIC_OBD_DICTIONARY: Record<string, string> = {
  P0300: 'Fallo de encendido aleatorio o en múltiples cilindros detectado',
  P0301: 'Fallo de encendido detectado en el cilindro 1',
  P0302: 'Fallo de encendido detectado en el cilindro 2',
  P0303: 'Fallo de encendido detectado en el cilindro 3',
  P0304: 'Fallo de encendido detectado en el cilindro 4',
  P0171: 'Sistema demasiado pobre (mezcla aire/combustible en Banco 1)',
  P0172: 'Sistema demasiado rico (mezcla aire/combustible en Banco 1)',
  P0420: 'Eficiencia del sistema catalizador por debajo del umbral (Banco 1)',
  P0102: 'Entrada baja en el circuito del sensor de flujo de masa de aire (MAF)',
  P0455: 'Fuga grande detectada en el sistema de control de emisiones evaporativas (EVAP)',
  P0456: 'Fuga muy pequeña detectada en el sistema de control de emisiones evaporativas (EVAP)',
  P0500: 'Fallo en el sensor de velocidad del vehículo (VSS)',
  P0562: 'Voltaje del sistema eléctrico bajo',
  P2195: 'Señal del sensor de oxígeno (A/F) atascada en mezcla pobre (Banco 1 Sensor 1)',
  P0115: 'Fallo en el circuito de temperatura del refrigerante del motor (ECT)',
  P0128: 'Temperatura del refrigerante por debajo de la temperatura reguladora del termostato',
  P0335: 'Fallo en el circuito del sensor de posición del cigüeñal (CKP)',
};

export const DESCRIPCION_DESCONOCIDA =
  'Código de diagnóstico OBD-II registrado en ECU (consultar manual de servicio)';

/** Descripción legible de un código, o un texto genérico si no está en la tabla. */
export function getDtcDescription(code: string): string {
  const normalized = code.trim().toUpperCase();
  return STATIC_OBD_DICTIONARY[normalized] || DESCRIPCION_DESCONOCIDA;
}
