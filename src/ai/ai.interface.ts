import { DtcType, ScanSeverity } from '@prisma/client';

/**
 * Datos que se envían al proveedor de IA para que genere una hipótesis técnica.
 *
 * CORRECCIÓN RESPECTO DE LA VERSIÓN ANTERIOR: `DiagnosisInput` declaraba
 * `monitorStatus` dentro de cada DTC. El readiness de monitores OBD es un dato
 * GLOBAL por escaneo (Mode 01 PID 01), no un atributo por código: pedirlo por
 * DTC habría hecho que el prompt solicitara un dato que no existe. Ahora vive
 * en `readiness`, una sola vez, igual que en el modelo de datos.
 */
export interface DiagnosisInput {
  vehicle: {
    plate: string;
    alias?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    vin?: string | null;
  };

  scan: {
    scannedAt: Date;
    batteryVoltage?: number | null;
  };

  /** Estado global de monitores de preparación (Mode 01 PID 01). */
  readiness?: {
    milOn?: boolean;
    dtcCount?: number;
    monitorsCompleted?: boolean;
    incompleteMonitors?: string[];
    batteryResetSuspected?: boolean;
    /** Motor de encendido por compresión (diésel). */
    compressionIgnition?: boolean;
  } | null;

  /**
   * Códigos leídos, ya enriquecidos por el filtro determinístico con la
   * descripción del diccionario estático y la marca de recurrencia.
   */
  dtcs: Array<{
    code: string;
    type: DtcType;
    description: string;
    isRecurrent: boolean;
  }>;

  /** Dictamen de la capa determinística, que la IA recibe como contexto. */
  deterministic: {
    severity: ScanSeverity;
    rationale: string;
    recurrentCodes: string[];
  };

  /** Escaneos anteriores del mismo vehículo, del más reciente al más antiguo. */
  history: Array<{
    scannedAt: Date;
    severity: ScanSeverity;
    codes: string[];
  }>;
}

/**
 * Contenido que devuelve el modelo, validado contra un esquema.
 *
 * Se llama "hipótesis" y no "diagnóstico" deliberadamente: el sistema sugiere,
 * el responsable humano decide.
 */
export interface DiagnosisHypothesis {
  summary: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  probableCauses: Array<{
    cause: string;
    confidence: 'ALTA' | 'MEDIA' | 'BAJA';
  }>;
  verificationSteps: string[];
  correlations: string | null;
}

/** Hipótesis + metadatos de la llamada, listo para persistir en `Diagnosis`. */
export interface DiagnosisResult {
  hypothesis: DiagnosisHypothesis;
  provider: string;
  model: string;
  prompt: string;
  rawResponse: string;
  tokensUsed: number | null;
  latencyMs: number;
}

export interface AiProvider {
  diagnose(input: DiagnosisInput): Promise<DiagnosisResult>;
  getProviderName(): string;
}

/** Error de dominio del proveedor de IA, para distinguirlo de fallos genéricos. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
