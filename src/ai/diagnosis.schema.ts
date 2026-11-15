import { z } from 'zod';

/**
 * Esquema de la respuesta del modelo.
 *
 * Se entrega al API mediante `output_config.format`, de modo que la respuesta
 * llega ya validada contra esta forma. Esto reemplaza la tarea "parser de
 * respuesta IA" que figuraba en el plan: no hay texto libre que interpretar,
 * ni expresiones regulares, ni JSON a medio formar.
 *
 * Las claves están en inglés para mapear directo al modelo `Diagnosis` de
 * Prisma; el CONTENIDO que escribe el modelo va en español, según lo indica el
 * prompt del sistema.
 */
export const DiagnosisHypothesisSchema = z.object({
  summary: z
    .string()
    .describe(
      'Hipótesis técnica en español, 2 a 3 oraciones, sin repetir los ' +
        'códigos ya listados. Debe redactarse como ' +
        'hipótesis a verificar, no como diagnóstico confirmado. Nunca afirmar ' +
        'que una pieza está fallada: indicar qué es consistente con los códigos.',
    ),

  severity: z
    .enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .describe(
      'Severidad sugerida según el riesgo para la operación del vehículo. ' +
        'CRITICAL solo si hay riesgo de daño mecánico mayor o de seguridad.',
    ),

  probableCauses: z
    .array(
      z.object({
        cause: z
          .string()
          .describe('Causa posible, concreta y verificable por un mecánico.'),
        confidence: z
          .enum(['ALTA', 'MEDIA', 'BAJA'])
          .describe(
            'Confianza en esta causa SEGÚN LA EVIDENCIA DISPONIBLE en el ' +
              'escaneo. Con un solo código y sin historial, la confianza ' +
              'raramente es ALTA.',
          ),
      }),
    )
    .min(1)
    .max(3)
    .describe(
      'Entre 1 y 3 causas posibles, ordenadas de más a menos probable. ' +
        'Solo las que la evidencia respalde: no rellenar hasta el máximo.',
    ),

  verificationSteps: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe(
      'Entre 1 y 5 pasos de verificación, del más barato y menos invasivo al ' +
        'más costoso. Son pasos para DESCARTAR o CONFIRMAR, no instrucciones ' +
        'de reparación. Una línea por paso, sin explicación larga.',
    ),

  correlations: z
    .string()
    .nullable()
    .describe(
      'Relación entre los códigos detectados y el estado de los monitores, si ' +
        'existe alguna relevante. null si los códigos no guardan relación entre sí.',
    ),
});

export type DiagnosisHypothesisParsed = z.infer<typeof DiagnosisHypothesisSchema>;
