// ============================================================================
// 9.3.1. Pruebas de caja negra — CU12. Interpretar Fallas con IA
// ============================================================================

import { DiagnosisHypothesisSchema } from '../ai/diagnosis.schema';
import { buildDiagnosisPrompt } from '../ai/diagnosis.prompt';
import { DtcType, ScanSeverity } from '@prisma/client';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU12. Interpretar Fallas con IA', () => {
    it('Prueba de CU12 Interpretar Fallas con IA', () => {
      // Entrada: Contexto técnico del vehículo y códigos DTC detectados en el escaneo
      const promptGenerado = buildDiagnosisPrompt({
        vehicle: {
          plate: '5521-TAC',
          alias: 'Camioneta Ciencias Agrícolas',
          make: 'Toyota',
          model: 'Tacoma',
          year: 2021,
          vin: '5TFCZ5AN3MX255216',
        },
        scan: {
          scannedAt: new Date('2026-11-22T14:00:00Z'),
          batteryVoltage: 13.3,
        },
        readiness: {
          milOn: true,
          dtcCount: 2,
          monitorsCompleted: true,
          incompleteMonitors: [],
        },
        dtcs: [
          {
            code: 'P0300',
            type: DtcType.CONFIRMED,
            description: 'Fallo de encendido aleatorio/múltiple detectado',
            isRecurrent: true,
          },
          {
            code: 'P0301',
            type: DtcType.CONFIRMED,
            description: 'Fallo de encendido detectado en cilindro 1',
            isRecurrent: false,
          },
        ],
        deterministic: {
          severity: ScanSeverity.CRITICAL,
          rationale: 'Códigos confirmados con recurrencia histórica en P0300.',
          recurrentCodes: ['P0300'],
        },
        history: [],
      });

      // Respuesta estructurada devuelta por el proveedor de IA (Claude API)
      const respuestaIa = {
        summary:
          'Se detecta fallo de encendido activo y recurrente focalizado en el cilindro 1 (P0301) que origina el código aleatorio P0300.',
        severity: 'CRITICAL',
        probableCauses: [
          {
            cause: 'Bobina de encendido directa del cilindro 1 con aislamiento perforado',
            confidence: 'ALTA',
          },
          {
            cause: 'Bujía del cilindro 1 con desgaste excesivo de electrodo',
            confidence: 'MEDIA',
          },
        ],
        verificationSteps: [
          'Intercambiar la bobina del cilindro 1 con el cilindro 2 y verificar si el fallo se traslada',
          'Inspeccionar el estado del electrodo de la bujía del cilindro 1',
        ],
        correlations:
          'P0300 y P0301 comparten la misma causa raíz en el sistema de ignición del cilindro 1.',
      };

      // Condición de ejecución: Validación del esquema de hipótesis técnica de IA
      const validacion = DiagnosisHypothesisSchema.safeParse(respuestaIa);

      // Resultado Esperado / Obtenido
      expect(promptGenerado).toContain('5521-TAC');
      expect(promptGenerado).toContain('P0301');
      expect(validacion.success).toBe(true);
      if (validacion.success) {
        expect(validacion.data.severity).toBe('CRITICAL');
        expect(validacion.data.probableCauses).toHaveLength(2);
        expect(validacion.data.verificationSteps).toHaveLength(2);
      }
    });
  });
});
