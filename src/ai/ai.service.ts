import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  AiProviderError,
  DiagnosisInput,
  DiagnosisResult,
} from './ai.interface';
import { ClaudeProvider } from './providers/claude.provider';
import { MockProvider } from './providers/mock.provider';

const EFFORT_VALIDOS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORT_VALIDOS)[number];

/**
 * Modelos que NO aceptan `output_config.effort` y devuelven 400 si se envía.
 * Haiku 4.5 es el caso relevante: es la opción más barata si el presupuesto
 * aprieta, y conviene que cambiar AI_MODEL no rompa nada.
 */
function modeloAceptaEffort(model: string): boolean {
  return !/haiku/i.test(model);
}

// Sonnet 5 en lugar de Opus 5: la tarea está acotada (el filtro determinístico
// ya clasificó la severidad, la semántica OBD vive en el prompt y el esquema
// impone la forma de la salida), así que no se justifica el costo de Opus.
const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_EFFORT: Effort = 'low';
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Selecciona el proveedor de IA según `AI_PROVIDER` y expone una única
 * operación de diagnóstico al resto de la aplicación.
 *
 * El resto del sistema nunca conoce qué proveedor está activo: eso es lo que
 * permite demostrar la extensibilidad (Claude hoy, Ollama local después) sin
 * tocar el flujo de escaneos.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private provider!: AiProvider;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.provider = this.buildProvider();
    this.logger.log(`Proveedor de IA activo: ${this.provider.getProviderName()}`);
  }

  getProviderName(): string {
    return this.provider?.getProviderName() ?? 'no inicializado';
  }

  /** true cuando el proveedor activo no llama a ninguna API externa. */
  isMock(): boolean {
    return this.getProviderName() === 'mock';
  }

  async diagnose(input: DiagnosisInput): Promise<DiagnosisResult> {
    return this.provider.diagnose(input);
  }

  private buildProvider(): AiProvider {
    const nombre = (this.configService.get<string>('AI_PROVIDER') ?? 'mock')
      .trim()
      .toLowerCase();

    switch (nombre) {
      case 'claude':
        return this.buildClaudeProvider();

      case 'mock':
        this.logger.warn(
          'AI_PROVIDER=mock: las hipótesis se generan localmente, sin llamar a ninguna API. ' +
            'No usar así en la demostración final.',
        );
        return new MockProvider();

      case 'ollama':
        // Pendiente: Fase 3, paso final del plan.
        throw new Error(
          'OllamaProvider todavía no está implementado. Use AI_PROVIDER=claude o AI_PROVIDER=mock.',
        );

      default:
        throw new Error(
          `AI_PROVIDER="${nombre}" no es válido. Valores aceptados: claude, mock, ollama.`,
        );
    }
  }

  private buildClaudeProvider(): AiProvider {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY')?.trim();

    // Falla al arrancar, no en la primera petición: es preferible que el
    // backend no inicie antes que descubrir la clave faltante a mitad de una
    // demostración.
    if (!apiKey || apiKey === 'your-anthropic-api-key') {
      throw new Error(
        'AI_PROVIDER=claude requiere ANTHROPIC_API_KEY en el archivo .env. ' +
          'Mientras no tenga la clave, use AI_PROVIDER=mock.',
      );
    }

    const model = this.configService.get<string>('AI_MODEL')?.trim() || DEFAULT_MODEL;
    const maxTokens = this.resolveMaxTokens();
    const effort = modeloAceptaEffort(model) ? this.resolveEffort() : null;

    if (effort === null) {
      this.logger.log(
        `El modelo ${model} no acepta el parámetro effort; se omite en la petición.`,
      );
    }

    this.logger.log(
      `ClaudeProvider configurado: modelo=${model} effort=${effort ?? 'n/a'} max_tokens=${maxTokens}`,
    );

    return new ClaudeProvider({ apiKey, model, effort, maxTokens });
  }

  private resolveEffort(): Effort | null {
    const raw = this.configService.get<string>('AI_EFFORT')?.trim().toLowerCase();
    if (!raw) return DEFAULT_EFFORT;

    // Escotilla manual por si un modelo futuro tampoco lo acepta.
    if (raw === 'none') return null;

    if (!EFFORT_VALIDOS.includes(raw as Effort)) {
      this.logger.warn(
        `AI_EFFORT="${raw}" no es válido; se usa "${DEFAULT_EFFORT}". ` +
          `Valores aceptados: ${EFFORT_VALIDOS.join(', ')}.`,
      );
      return DEFAULT_EFFORT;
    }

    return raw as Effort;
  }

  private resolveMaxTokens(): number {
    const raw = this.configService.get<string>('AI_MAX_TOKENS');
    if (!raw) return DEFAULT_MAX_TOKENS;

    const parsed = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(parsed) || parsed < 1024) {
      this.logger.warn(
        `AI_MAX_TOKENS="${raw}" no es válido; se usa ${DEFAULT_MAX_TOKENS}.`,
      );
      return DEFAULT_MAX_TOKENS;
    }

    return parsed;
  }
}

export { AiProviderError };
