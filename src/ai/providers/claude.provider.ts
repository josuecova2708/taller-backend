import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  AiProvider,
  AiProviderError,
  DiagnosisInput,
  DiagnosisResult,
} from '../ai.interface';
import { DiagnosisHypothesisSchema } from '../diagnosis.schema';
import {
  DIAGNOSIS_SYSTEM_PROMPT,
  buildDiagnosisPrompt,
} from '../diagnosis.prompt';

export interface ClaudeProviderOptions {
  apiKey: string;
  model: string;
  /**
   * Profundidad de razonamiento: a menor esfuerzo, menor costo.
   * `null` cuando el modelo no acepta el parámetro (p. ej. Haiku 4.5,
   * que devuelve 400 si se envía).
   */
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  maxTokens: number;
}

/**
 * Proveedor de hipótesis técnicas basado en Claude API.
 *
 * Usa el SDK oficial `@anthropic-ai/sdk` y salida estructurada
 * (`output_config.format`), de modo que la respuesta llega validada contra
 * `DiagnosisHypothesisSchema`. No hay parseo manual de texto.
 */
export class ClaudeProvider implements AiProvider {
  private readonly logger = new Logger(ClaudeProvider.name);
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  getProviderName(): string {
    return 'claude';
  }

  async diagnose(input: DiagnosisInput): Promise<DiagnosisResult> {
    const prompt = buildDiagnosisPrompt(input);
    const startedAt = Date.now();

    let response: Awaited<ReturnType<typeof this.client.messages.parse>>;
    try {
      response = await this.client.messages.parse({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        system: DIAGNOSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        output_config: {
          // `effort` solo se envía si el modelo lo soporta.
          ...(this.options.effort ? { effort: this.options.effort } : {}),
          format: zodOutputFormat(DiagnosisHypothesisSchema),
        },
      });
    } catch (error) {
      throw this.translateError(error);
    }

    const latencyMs = Date.now() - startedAt;

    // El `stop_reason` se revisa ANTES de leer el contenido: una negativa o un
    // corte por longitud devuelven HTTP 200 con contenido inservible.
    if (response.stop_reason === 'refusal') {
      throw new AiProviderError(
        'El modelo declinó procesar este escaneo. Revise los datos enviados ' +
          'y genere la hipótesis manualmente.',
      );
    }

    if (response.stop_reason === 'max_tokens') {
      throw new AiProviderError(
        `La respuesta se cortó por límite de tokens (max_tokens=${this.options.maxTokens}). ` +
          'Aumente AI_MAX_TOKENS o baje AI_EFFORT.',
      );
    }

    if (!response.parsed_output) {
      throw new AiProviderError(
        'El modelo respondió pero la salida no validó contra el esquema de hipótesis.',
      );
    }

    const tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    this.logger.log(
      `Hipótesis generada con ${this.options.model} en ${latencyMs}ms ` +
        `(${tokensUsed} tokens, effort ${this.options.effort ?? 'n/a'})`,
    );

    return {
      hypothesis: response.parsed_output,
      provider: this.getProviderName(),
      model: this.options.model,
      prompt,
      rawResponse: JSON.stringify(response.parsed_output),
      tokensUsed: tokensUsed > 0 ? tokensUsed : null,
      latencyMs,
    };
  }

  /**
   * Traduce los errores del SDK a mensajes accionables en español.
   *
   * Se encadena de lo más específico a lo más genérico: colapsar todo en un
   * solo `catch` perdería la distinción entre un fallo reintentable (429, 5xx,
   * red) y uno de configuración (401, 400).
   */
  private translateError(error: unknown): AiProviderError {
    if (error instanceof Anthropic.AuthenticationError) {
      return new AiProviderError(
        'ANTHROPIC_API_KEY inválida o revocada. Verifique la clave en el archivo .env.',
        error,
      );
    }

    if (error instanceof Anthropic.PermissionDeniedError) {
      return new AiProviderError(
        'La clave de API no tiene permiso para usar este modelo. Revise AI_MODEL.',
        error,
      );
    }

    if (error instanceof Anthropic.NotFoundError) {
      return new AiProviderError(
        `El modelo "${this.options.model}" no existe o no está disponible para esta clave. ` +
          'Revise AI_MODEL en el archivo .env.',
        error,
      );
    }

    if (error instanceof Anthropic.RateLimitError) {
      return new AiProviderError(
        'Se alcanzó el límite de peticiones de la API. Reintente en unos segundos.',
        error,
      );
    }

    if (error instanceof Anthropic.BadRequestError) {
      return new AiProviderError(
        `La petición fue rechazada por la API: ${error.message}`,
        error,
      );
    }

    if (error instanceof Anthropic.InternalServerError) {
      return new AiProviderError(
        'La API de Anthropic devolvió un error interno. Reintente más tarde.',
        error,
      );
    }

    if (error instanceof Anthropic.APIConnectionError) {
      return new AiProviderError(
        'No se pudo conectar con la API de Anthropic. Verifique la conexión a internet.',
        error,
      );
    }

    if (error instanceof Anthropic.APIError) {
      return new AiProviderError(`Error de la API de Anthropic: ${error.message}`, error);
    }

    return new AiProviderError(
      `Fallo inesperado al generar la hipótesis: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
  }
}
