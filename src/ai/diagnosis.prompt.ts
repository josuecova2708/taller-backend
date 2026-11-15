import { DiagnosisInput } from './ai.interface';

/**
 * Prompt del sistema: define el rol, el encuadre de "hipótesis" y los límites.
 *
 * Es texto constante y va primero en la petición, de modo que puede cachearse
 * si en el futuro el volumen de llamadas lo justifica.
 */
export const DIAGNOSIS_SYSTEM_PROMPT = `Eres un asistente técnico especializado en diagnóstico automotriz OBD-II que apoya a los responsables del mantenimiento de la flota vehicular de la Universidad Autónoma Gabriel René Moreno.

Tu función es generar HIPÓTESIS TÉCNICAS A VERIFICAR a partir de códigos de falla ya leídos de la ECU. NO emites diagnósticos confirmados y NO autorizas ni prohíbes la operación de un vehículo: esa decisión es siempre de un responsable humano.

Reglas que debes respetar sin excepción:

1. Redacta en español técnico, claro y conciso. El lector es un mecánico o un encargado de flota, no un ingeniero de software.

2. Nunca afirmes que una pieza está fallada. Formula lo que es CONSISTENTE con la evidencia. Di "el patrón es consistente con una bujía o bobina en mal estado", no "la bujía está quemada".

3. Un código PERMANENTE (Modo 0A) puede permanecer almacenado después de una reparación correcta, hasta que la ECU complete sus ciclos de verificación. Por sí solo NO demuestra que la falla esté activa. Si los monitores de preparación están incompletos, considera explícitamente la posibilidad de una reparación reciente o de una desconexión de batería.

4. Un código PENDIENTE (Modo 07) proviene de un solo ciclo de conducción y puede desaparecer. No lo trates como una falla confirmada.

5. Un código CONFIRMADO (Modo 03) indica que la ECU validó la falla en ciclos consecutivos. Es la evidencia más fuerte de las tres.

6. La recurrencia histórica de un código es evidencia fuerte: si un código reaparece en escaneos sucesivos, dilo y súbele la severidad.

7. Ajusta tu confianza a la evidencia real. Con un solo código y sin historial, la confianza de cada causa raramente debería ser ALTA. No inventes certeza que los datos no respaldan.

8. No recomiendes reemplazar piezas como primer paso. Los pasos de verificación van del más barato y menos invasivo al más costoso.

9. Si los datos son insuficientes para una hipótesis útil, dilo en el resumen en lugar de rellenar con generalidades.

10. No menciones que eres un modelo de lenguaje ni describas tu propio razonamiento. Entrega solo el contenido técnico.

11. Sé breve. Cada paso de verificación es una línea. No repitas en el resumen los códigos que ya están listados ni expliques dos veces la misma idea. Un informe corto y denso es más útil para un mecánico que uno largo.`;

function formatVehicle(input: DiagnosisInput): string {
  const { vehicle } = input;
  const descripcion = [vehicle.make, vehicle.model, vehicle.year]
    .filter(Boolean)
    .join(' ');

  const lineas = [
    `Placa: ${vehicle.plate}`,
    descripcion ? `Vehículo: ${descripcion}` : 'Vehículo: datos no registrados',
  ];

  if (vehicle.alias) lineas.push(`Identificación interna: ${vehicle.alias}`);
  if (vehicle.vin) lineas.push(`VIN: ${vehicle.vin}`);

  return lineas.join('\n');
}

function formatReadiness(input: DiagnosisInput): string {
  const r = input.readiness;
  if (!r) {
    return 'Estado de monitores: no se pudo leer en este escaneo.';
  }

  const lineas: string[] = [];

  // El tipo de motor es el dato que más condiciona la hipótesis: un código de
  // EGR o de catalizador no significa lo mismo en diésel que en gasolina.
  if (r.compressionIgnition !== undefined) {
    lineas.push(
      r.compressionIgnition
        ? 'Tipo de motor: ENCENDIDO POR COMPRESIÓN (diésel). Los monitores de preparación corresponden a catalizador NMHC, SCR/NOx, sobrealimentación, sensor de gases de escape y filtro de partículas. Este vehículo NO tiene sistema EVAP ni sensores de oxígeno convencionales.'
        : 'Tipo de motor: encendido por chispa (gasolina).',
    );
  }

  if (r.milOn !== undefined) {
    lineas.push(
      `Testigo de falla (MIL): ${r.milOn ? 'ENCENDIDO' : 'apagado'}`,
    );
  }
  if (r.dtcCount !== undefined) {
    lineas.push(`Códigos reportados por la ECU: ${r.dtcCount}`);
  }

  if (r.monitorsCompleted === false) {
    const pendientes = r.incompleteMonitors?.length
      ? r.incompleteMonitors.join(', ')
      : 'no identificados';
    lineas.push(`Monitores de preparación INCOMPLETOS: ${pendientes}`);
    if (r.batteryResetSuspected) {
      lineas.push(
        'Se sospecha desconexión reciente de batería o borrado de códigos ' +
          '(varios monitores incompletos a la vez).',
      );
    }
  } else if (r.monitorsCompleted === true) {
    lineas.push(
      'Monitores de preparación COMPLETOS: la ECU terminó sus ciclos de verificación.',
    );
  }

  return lineas.join('\n');
}

function formatDtcs(input: DiagnosisInput): string {
  if (input.dtcs.length === 0) {
    return 'No se detectaron códigos de falla en los modos 03, 07 ni 0A.';
  }

  const etiquetas: Record<string, string> = {
    CONFIRMED: 'CONFIRMADO (Modo 03)',
    PENDING: 'PENDIENTE (Modo 07)',
    PERMANENT: 'PERMANENTE (Modo 0A)',
  };

  return input.dtcs
    .map((dtc) => {
      const recurrencia = dtc.isRecurrent
        ? ' [REAPARECE respecto de escaneos anteriores]'
        : '';
      return `- ${dtc.code} — ${etiquetas[dtc.type] ?? dtc.type}${recurrencia}\n  ${dtc.description}`;
    })
    .join('\n');
}

function formatHistory(input: DiagnosisInput): string {
  if (input.history.length === 0) {
    return 'Sin escaneos anteriores registrados para este vehículo.';
  }

  return input.history
    .map((h) => {
      const fecha = h.scannedAt.toISOString().slice(0, 10);
      const codigos = h.codes.length > 0 ? h.codes.join(', ') : 'sin códigos';
      return `- ${fecha} — severidad ${h.severity} — ${codigos}`;
    })
    .join('\n');
}

/**
 * Construye el mensaje de usuario a partir de los datos del escaneo.
 *
 * Se devuelve como string para poder persistirlo en `Diagnosis.prompt` y
 * auditar después con qué datos exactos se generó cada hipótesis.
 */
export function buildDiagnosisPrompt(input: DiagnosisInput): string {
  const voltaje =
    input.scan.batteryVoltage !== null && input.scan.batteryVoltage !== undefined
      ? `${input.scan.batteryVoltage} V`
      : 'no medido';

  return [
    '## Vehículo',
    formatVehicle(input),
    '',
    '## Escaneo actual',
    `Fecha: ${input.scan.scannedAt.toISOString()}`,
    `Voltaje de batería: ${voltaje}`,
    '',
    '## Estado global de monitores (Mode 01 PID 01)',
    formatReadiness(input),
    '',
    '## Códigos de falla leídos',
    formatDtcs(input),
    '',
    '## Historial de escaneos anteriores',
    formatHistory(input),
    '',
    '## Dictamen de la capa determinística',
    `Severidad calculada por reglas: ${input.deterministic.severity}`,
    input.deterministic.recurrentCodes.length > 0
      ? `Códigos recurrentes detectados: ${input.deterministic.recurrentCodes.join(', ')}`
      : 'Sin códigos recurrentes.',
    `Razonamiento: ${input.deterministic.rationale}`,
    '',
    '## Tarea',
    'Genera una hipótesis técnica a verificar para este escaneo. Considera el',
    'tipo de cada código, el estado de los monitores y el historial del',
    'vehículo. Puedes discrepar de la severidad calculada por reglas si la',
    'evidencia lo justifica; si lo haces, explica por qué en el resumen.',
  ].join('\n');
}
