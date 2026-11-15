import { DtcType, ScanSeverity } from '@prisma/client';
import { DiagnosisInput } from './ai.interface';
import {
  DIAGNOSIS_SYSTEM_PROMPT,
  buildDiagnosisPrompt,
} from './diagnosis.prompt';
import { DiagnosisHypothesisSchema } from './diagnosis.schema';
import { MockProvider } from './providers/mock.provider';

function inputTacoma(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    vehicle: {
      plate: '5521-TAC',
      alias: 'Camioneta Rectorado',
      make: 'Toyota',
      model: 'Tacoma',
      year: 2021,
      vin: '5TFCZ5AN3MX255216',
    },
    scan: {
      scannedAt: new Date('2026-10-16T14:30:00.000Z'),
      batteryVoltage: 13.3,
    },
    readiness: {
      milOn: true,
      dtcCount: 4,
      monitorsCompleted: true,
      incompleteMonitors: [],
      batteryResetSuspected: false,
    },
    dtcs: [
      {
        code: 'P0300',
        type: DtcType.CONFIRMED,
        description: 'Fallo de encendido aleatorio o en múltiples cilindros detectado',
        isRecurrent: true,
      },
      {
        code: 'P2195',
        type: DtcType.PENDING,
        description: 'Señal del sensor de oxígeno (A/F) atascada en mezcla pobre',
        isRecurrent: false,
      },
    ],
    deterministic: {
      severity: ScanSeverity.CRITICAL,
      rationale: 'Código confirmado con recurrencia histórica.',
      recurrentCodes: ['P0300'],
    },
    history: [
      {
        scannedAt: new Date('2026-10-01T09:00:00.000Z'),
        severity: ScanSeverity.HIGH,
        codes: ['P0300'],
      },
    ],
    ...overrides,
  };
}

describe('Prompt del sistema', () => {
  it('encuadra la salida como hipótesis y no como diagnóstico confirmado', () => {
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain('HIPÓTESIS TÉCNICAS A VERIFICAR');
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain('NO emites diagnósticos confirmados');
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain(
      'decisión es siempre de un responsable humano',
    );
  });

  it('instruye sobre la semántica real de cada modo OBD', () => {
    // Es el núcleo técnico del proyecto: sin esto el modelo trataría un
    // código permanente como una falla activa.
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain('Modo 0A');
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain('Modo 07');
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain('Modo 03');
    expect(DIAGNOSIS_SYSTEM_PROMPT).toContain(
      'puede permanecer almacenado después de una reparación',
    );
  });
});

describe('buildDiagnosisPrompt', () => {
  it('incluye contexto del vehículo, voltaje y fecha', () => {
    const prompt = buildDiagnosisPrompt(inputTacoma());

    expect(prompt).toContain('5521-TAC');
    expect(prompt).toContain('Toyota Tacoma 2021');
    expect(prompt).toContain('5TFCZ5AN3MX255216');
    expect(prompt).toContain('13.3 V');
  });

  it('presenta el readiness como dato GLOBAL del escaneo, una sola vez', () => {
    const prompt = buildDiagnosisPrompt(inputTacoma());

    // Regresión: la interfaz anterior pedía monitorStatus por cada DTC.
    const ocurrencias = prompt.split('Estado global de monitores').length - 1;
    expect(ocurrencias).toBe(1);
    expect(prompt).toContain('Mode 01 PID 01');
  });

  it('etiqueta cada código con su modo OBD y marca la recurrencia', () => {
    const prompt = buildDiagnosisPrompt(inputTacoma());

    expect(prompt).toContain('P0300 — CONFIRMADO (Modo 03) [REAPARECE');
    expect(prompt).toContain('P2195 — PENDIENTE (Modo 07)');
    expect(prompt).not.toContain('P2195 — PENDIENTE (Modo 07) [REAPARECE');
  });

  it('informa monitores incompletos y sospecha de desconexión de batería', () => {
    const prompt = buildDiagnosisPrompt(
      inputTacoma({
        readiness: {
          milOn: false,
          dtcCount: 1,
          monitorsCompleted: false,
          incompleteMonitors: ['Catalizador', 'Sistema EVAP'],
          batteryResetSuspected: true,
        },
      }),
    );

    expect(prompt).toContain('INCOMPLETOS: Catalizador, Sistema EVAP');
    expect(prompt).toContain('desconexión reciente de batería');
  });

  it('advierte al modelo cuando el motor es diésel', () => {
    // Sin esto, el modelo razonaría sobre sistema EVAP y sensores de oxígeno
    // convencionales en un vehículo que no los tiene.
    const prompt = buildDiagnosisPrompt(
      inputTacoma({
        readiness: {
          milOn: true,
          monitorsCompleted: false,
          incompleteMonitors: ['Catalizador NMHC', 'Filtro de partículas (DPF)'],
          compressionIgnition: true,
        },
      }),
    );

    expect(prompt).toContain('ENCENDIDO POR COMPRESIÓN (diésel)');
    expect(prompt).toContain('NO tiene sistema EVAP');
    expect(prompt).toContain('Filtro de partículas (DPF)');
  });

  it('indica motor a gasolina cuando no hay compresión', () => {
    const prompt = buildDiagnosisPrompt(
      inputTacoma({
        readiness: { monitorsCompleted: true, compressionIgnition: false },
      }),
    );

    expect(prompt).toContain('encendido por chispa (gasolina)');
    expect(prompt).not.toContain('diésel');
  });

  it('maneja escaneo sin códigos y vehículo sin historial', () => {
    const prompt = buildDiagnosisPrompt(inputTacoma({ dtcs: [], history: [] }));

    expect(prompt).toContain('No se detectaron códigos de falla');
    expect(prompt).toContain('Sin escaneos anteriores registrados');
  });

  it('traslada el dictamen determinístico como contexto, no como orden', () => {
    const prompt = buildDiagnosisPrompt(inputTacoma());

    expect(prompt).toContain('Severidad calculada por reglas: CRITICAL');
    expect(prompt).toContain('Códigos recurrentes detectados: P0300');
    expect(prompt).toContain('Puedes discrepar de la severidad calculada');
  });
});

describe('MockProvider', () => {
  const provider = new MockProvider();

  it('produce una hipótesis que valida contra el esquema de salida', async () => {
    const result = await provider.diagnose(inputTacoma());

    // Mismo esquema que se le exige a Claude: si el mock pasa, el flujo de
    // persistencia también funciona con el proveedor real.
    expect(() => DiagnosisHypothesisSchema.parse(result.hypothesis)).not.toThrow();
    expect(result.provider).toBe('mock');
    expect(result.prompt).toContain('5521-TAC');
  });

  it('escala a CRITICAL cuando hay un confirmado recurrente', async () => {
    const result = await provider.diagnose(inputTacoma());
    expect(result.hypothesis.severity).toBe('CRITICAL');
  });

  it('no escala cuando solo hay un pendiente sin recurrencia', async () => {
    const result = await provider.diagnose(
      inputTacoma({
        dtcs: [
          {
            code: 'P2195',
            type: DtcType.PENDING,
            description: 'Sensor A/F atascado en mezcla pobre',
            isRecurrent: false,
          },
        ],
        history: [],
      }),
    );

    expect(result.hypothesis.severity).toBe('LOW');
  });

  it('ante un escaneo limpio con monitores incompletos pide re-escaneo', async () => {
    const result = await provider.diagnose(
      inputTacoma({
        dtcs: [],
        readiness: {
          monitorsCompleted: false,
          incompleteMonitors: ['Catalizador'],
          batteryResetSuspected: false,
        },
      }),
    );

    expect(result.hypothesis.summary).toContain('no es concluyente');
    expect(result.hypothesis.verificationSteps.join(' ')).toContain(
      'ciclo de conducción',
    );
  });
});

describe('DiagnosisHypothesisSchema', () => {
  it('rechaza una severidad fuera del enum', () => {
    expect(() =>
      DiagnosisHypothesisSchema.parse({
        summary: 'x',
        severity: 'URGENTE',
        probableCauses: [{ cause: 'y', confidence: 'ALTA' }],
        verificationSteps: ['z'],
        correlations: null,
      }),
    ).toThrow();
  });

  it('exige al menos una causa y un paso de verificación', () => {
    expect(() =>
      DiagnosisHypothesisSchema.parse({
        summary: 'x',
        severity: 'HIGH',
        probableCauses: [],
        verificationSteps: [],
        correlations: null,
      }),
    ).toThrow();
  });
});
