import { DtcType } from '@prisma/client';
import {
  AiProvider,
  DiagnosisHypothesis,
  DiagnosisInput,
  DiagnosisResult,
} from '../ai.interface';
import { buildDiagnosisPrompt } from '../diagnosis.prompt';

/**
 * Proveedor determinístico que no llama a ninguna API.
 *
 * Existe por dos razones: permite ejercitar el flujo completo
 * (escaneo -> hipótesis -> orden) sin clave ni costo, y da a los tests una
 * respuesta estable. Se activa con `AI_PROVIDER=mock`.
 *
 * NO es un diagnóstico: arma un texto a partir de los datos que ya trae el
 * escaneo. Si aparece en una demo, debe advertirse que es un proveedor de prueba.
 */
export class MockProvider implements AiProvider {
  getProviderName(): string {
    return 'mock';
  }

  async diagnose(input: DiagnosisInput): Promise<DiagnosisResult> {
    const prompt = buildDiagnosisPrompt(input);
    const hypothesis = this.buildHypothesis(input);

    return {
      hypothesis,
      provider: this.getProviderName(),
      model: 'mock-deterministico',
      prompt,
      rawResponse: JSON.stringify(hypothesis),
      tokensUsed: null,
      latencyMs: 0,
    };
  }

  private buildHypothesis(input: DiagnosisInput): DiagnosisHypothesis {
    const confirmados = input.dtcs.filter((d) => d.type === DtcType.CONFIRMED);
    const permanentes = input.dtcs.filter((d) => d.type === DtcType.PERMANENT);
    const pendientes = input.dtcs.filter((d) => d.type === DtcType.PENDING);
    const recurrentes = input.dtcs.filter((d) => d.isRecurrent);
    const monitoresIncompletos = input.readiness?.monitorsCompleted === false;

    if (input.dtcs.length === 0) {
      return {
        summary:
          'El escaneo no reporta códigos de falla en los modos 03, 07 ni 0A. ' +
          (monitoresIncompletos
            ? 'Los monitores de preparación están incompletos, por lo que el resultado no es concluyente: se requiere re-escaneo tras completar el ciclo de conducción.'
            : 'Con los monitores completos, no hay evidencia de falla almacenada en la ECU.'),
        severity: monitoresIncompletos ? 'LOW' : 'LOW',
        probableCauses: [
          {
            cause: monitoresIncompletos
              ? 'Borrado reciente de códigos o desconexión de batería'
              : 'Sin causa a investigar con la evidencia actual',
            confidence: 'BAJA',
          },
        ],
        verificationSteps: monitoresIncompletos
          ? [
              'Completar un ciclo de conducción y repetir el escaneo.',
              'Verificar el estado de carga de la batería.',
            ]
          : ['Mantener el escaneo periódico programado.'],
        correlations: null,
      };
    }

    const severity: DiagnosisHypothesis['severity'] =
      confirmados.length >= 2 || recurrentes.length > 0
        ? 'CRITICAL'
        : confirmados.length === 1
          ? 'HIGH'
          : permanentes.length > 0
            ? 'MEDIUM'
            : 'LOW';

    const partes: string[] = [];

    if (confirmados.length > 0) {
      partes.push(
        `Se detectaron ${confirmados.length} código(s) confirmado(s) (${confirmados
          .map((d) => d.code)
          .join(', ')}), lo que indica que la ECU validó la falla en ciclos consecutivos.`,
      );
    }
    if (permanentes.length > 0) {
      partes.push(
        `Hay código(s) permanente(s) (${permanentes.map((d) => d.code).join(', ')}); ` +
          'un código permanente puede persistir después de una reparación hasta que la ECU complete sus ciclos de verificación.',
      );
    }
    if (pendientes.length > 0) {
      partes.push(
        `Código(s) pendiente(s) (${pendientes.map((d) => d.code).join(', ')}) provenientes de un solo ciclo de conducción.`,
      );
    }
    if (recurrentes.length > 0) {
      partes.push(
        `Reaparecen respecto de escaneos anteriores: ${recurrentes.map((d) => d.code).join(', ')}.`,
      );
    }

    return {
      summary: partes.join(' '),
      severity,
      probableCauses: input.dtcs.slice(0, 3).map((dtc) => ({
        cause: `Condición consistente con: ${dtc.description}`,
        confidence: dtc.isRecurrent
          ? 'MEDIA'
          : dtc.type === DtcType.CONFIRMED
            ? 'MEDIA'
            : 'BAJA',
      })),
      verificationSteps: [
        'Inspección visual de conexiones y arneses asociados a los códigos reportados.',
        'Verificar voltaje de batería y sistema de carga.',
        'Repetir el escaneo tras un ciclo de conducción para confirmar persistencia.',
      ],
      correlations:
        input.dtcs.length > 1
          ? `Se reportan ${input.dtcs.length} códigos en el mismo escaneo; verificar si comparten un circuito o sensor común.`
          : null,
    };
  }
}
