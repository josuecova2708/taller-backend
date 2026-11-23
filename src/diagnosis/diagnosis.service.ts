import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ScanSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  AiProviderError,
  DiagnosisHypothesis,
  DiagnosisInput,
} from '../ai/ai.interface';
import { getDtcDescription } from '../obd/dtc-dictionary';
import { WorkOrdersService } from '../work-orders/work-orders.service';

/**
 * Cuántos escaneos previos se incluyen como historial.
 *
 * Tres, no uno: comparar solo contra el escaneo anterior no detecta fallas
 * intermitentes que aparecen, desaparecen y vuelven (escaneos 1 y 3), que es
 * precisamente el patrón que un sistema preventivo debe cazar.
 */
export const VENTANA_HISTORIAL = 3;

@Injectable()
export class DiagnosisService {
  private readonly logger = new Logger(DiagnosisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly workOrdersService: WorkOrdersService,
  ) {}

  async findByScan(scanId: string) {
    const diagnosis = await this.prisma.diagnosis.findUnique({
      where: { scanId },
      include: {
        scan: {
          include: { vehicle: true, dtcEntries: true },
        },
        workOrder: true,
      },
    });

    if (!diagnosis) {
      const scan = await this.prisma.scan.findUnique({
        where: { id: scanId },
        select: { id: true, aiProcessed: true, severity: true },
      });

      if (!scan) {
        throw new NotFoundException(`Escaneo ${scanId} no encontrado`);
      }

      // Distinguir "todavía no llegó" de "no corresponde" es importante para
      // la interfaz: en el primer caso debe seguir refrescando.
      throw new NotFoundException(
        scan.aiProcessed
          ? `El escaneo ${scanId} no generó hipótesis de IA (severidad ${scan.severity}: no requiere evaluación).`
          : `La hipótesis del escaneo ${scanId} todavía se está generando.`,
      );
    }

    return diagnosis;
  }

  /**
   * Genera y persiste la hipótesis técnica de un escaneo.
   *
   * Se invoca en segundo plano desde `ScansService`: la llamada al proveedor
   * tarda del orden de 15 segundos y el inspector no debe esperar con el
   * teléfono en la mano. Nunca lanza: ante un fallo lo registra y deja el
   * escaneo con `aiProcessed = false` para poder reintentar.
   */
  async processScan(scanId: string): Promise<void> {
    try {
      const input = await this.buildInput(scanId);
      const resultado = await this.aiService.diagnose(input);
      const { hypothesis } = resultado;

      const diagnosis = await this.prisma.diagnosis.upsert({
        where: { scanId },
        update: {
          provider: resultado.provider,
          prompt: resultado.prompt,
          response: resultado.rawResponse,
          summary: hypothesis.summary,
          severity: hypothesis.severity,
          recommendations: this.empaquetarRecomendaciones(resultado.hypothesis),
          tokensUsed: resultado.tokensUsed,
          latencyMs: resultado.latencyMs,
        },
        create: {
          scanId,
          provider: resultado.provider,
          prompt: resultado.prompt,
          response: resultado.rawResponse,
          summary: hypothesis.summary,
          severity: hypothesis.severity,
          recommendations: this.empaquetarRecomendaciones(resultado.hypothesis),
          tokensUsed: resultado.tokensUsed,
          latencyMs: resultado.latencyMs,
        },
      });

      await this.prisma.scan.update({
        where: { id: scanId },
        data: { aiProcessed: true },
      });

      await this.vincularAOrden(scanId, diagnosis.id, hypothesis.summary);
      await this.sembrarTareasSugeridas(scanId, hypothesis.verificationSteps);

      this.logger.log(
        `Hipótesis guardada para el escaneo ${scanId} ` +
          `(${resultado.provider}/${resultado.model}, ${resultado.latencyMs}ms, ` +
          `severidad sugerida ${hypothesis.severity})`,
      );
    } catch (error) {
      // El escaneo y su orden ya están persistidos y siguen siendo válidos: el
      // dictamen determinístico no depende de la IA. Por eso este fallo no se
      // propaga ni revierte nada.
      const detalle =
        error instanceof AiProviderError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);

      this.logger.error(
        `No se pudo generar la hipótesis del escaneo ${scanId}: ${detalle}. ` +
          'El escaneo queda con aiProcessed=false y es reintentable.',
      );
    }
  }

  /** Escaneos que requerían hipótesis y todavía no la tienen. */
  async findPending(limit = 20) {
    return this.prisma.scan.findMany({
      where: {
        aiProcessed: false,
        diagnosis: null,
        severity: { in: [ScanSeverity.MEDIUM, ScanSeverity.HIGH, ScanSeverity.CRITICAL] },
      },
      orderBy: { scannedAt: 'desc' },
      take: limit,
      select: { id: true, scannedAt: true, severity: true, vehicleId: true },
    });
  }

  /**
   * Arma la entrada del proveedor a partir de los datos ya persistidos.
   *
   * Se lee de la base y no se recibe por parámetro a propósito: así el
   * reintento manual produce exactamente la misma entrada que el primer
   * intento.
   */
  private async buildInput(scanId: string): Promise<DiagnosisInput> {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: { vehicle: true, dtcEntries: true },
    });

    if (!scan) {
      throw new NotFoundException(`Escaneo ${scanId} no encontrado`);
    }

    const previos = await this.prisma.scan.findMany({
      where: {
        vehicleId: scan.vehicleId,
        id: { not: scanId },
        scannedAt: { lt: scan.scannedAt },
      },
      orderBy: { scannedAt: 'desc' },
      take: VENTANA_HISTORIAL,
      include: { dtcEntries: { select: { code: true } } },
    });

    const codigosPrevios = new Set(
      previos.flatMap((p) => p.dtcEntries.map((d) => d.code.trim().toUpperCase())),
    );

    const readiness = this.leerReadiness(scan.readinessStatus);

    return {
      vehicle: {
        plate: scan.vehicle.plate,
        alias: scan.vehicle.alias,
        make: scan.vehicle.make,
        model: scan.vehicle.model,
        year: scan.vehicle.year,
        vin: scan.vehicle.vin,
      },
      scan: {
        scannedAt: scan.scannedAt,
        batteryVoltage: scan.batteryVoltage,
      },
      readiness,
      dtcs: scan.dtcEntries.map((entry) => {
        const code = entry.code.trim().toUpperCase();
        return {
          code,
          type: entry.type,
          description: getDtcDescription(code),
          isRecurrent: codigosPrevios.has(code),
        };
      }),
      deterministic: {
        severity: scan.severity,
        rationale:
          scan.rationale ?? scan.notes ?? 'Sin dictamen determinístico registrado.',
        recurrentCodes: scan.dtcEntries
          .map((e) => e.code.trim().toUpperCase())
          .filter((code) => codigosPrevios.has(code)),
      },
      history: previos.map((p) => ({
        scannedAt: p.scannedAt,
        severity: p.severity,
        codes: p.dtcEntries.map((d) => d.code),
      })),
    };
  }

  /**
   * `readinessStatus` es una columna JSON: lo que viene de la base no tiene
   * garantía de forma, así que se lee defensivamente.
   */
  private leerReadiness(valor: Prisma.JsonValue | null): DiagnosisInput['readiness'] {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
      return null;
    }

    const raw = valor as Record<string, unknown>;
    const comoBooleano = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

    return {
      milOn: comoBooleano(raw.milOn),
      dtcCount: typeof raw.dtcCount === 'number' ? raw.dtcCount : undefined,
      monitorsCompleted: comoBooleano(raw.monitorsCompleted),
      incompleteMonitors: Array.isArray(raw.incompleteMonitors)
        ? raw.incompleteMonitors.filter((m): m is string => typeof m === 'string')
        : undefined,
      batteryResetSuspected: comoBooleano(raw.batteryResetSuspected),
      compressionIgnition: comoBooleano(raw.compressionIgnition),
    };
  }

  /**
   * `Diagnosis.recommendations` es una columna JSON, así que guarda la parte
   * estructurada de la hipótesis completa: causas con su confianza, pasos de
   * verificación y correlaciones. `summary` y `severity` tienen columna propia.
   */
  private empaquetarRecomendaciones(
    hypothesis: DiagnosisHypothesis,
  ): Prisma.InputJsonValue {
    return {
      probableCauses: hypothesis.probableCauses,
      verificationSteps: hypothesis.verificationSteps,
      correlations: hypothesis.correlations,
    };
  }

  private async vincularAOrden(
    scanId: string,
    diagnosisId: string,
    resumen: string,
  ): Promise<void> {
    const orden = await this.prisma.workOrder.findUnique({ where: { scanId } });

    if (orden) {
      await this.workOrdersService.attachDiagnosis(orden.id, diagnosisId, resumen);
      return;
    }

    // Si el escaneo no originó una orden propia, puede haberse adjuntado a una
    // orden abierta previa del mismo vehículo (regla de deduplicación). En ese
    // caso la hipótesis queda asociada al escaneo, no a la orden ajena.
    this.logger.log(
      `El escaneo ${scanId} no tiene orden propia; la hipótesis queda asociada solo al escaneo.`,
    );
  }

  /**
   * Si la orden aún no tiene tareas en `work_order_tasks`, siembra los pasos de
   * verificación sugeridos por la hipótesis de IA como checklist inicial.
   */
  private async sembrarTareasSugeridas(
    scanId: string,
    verificationSteps: string[],
  ): Promise<void> {
    if (!Array.isArray(verificationSteps) || verificationSteps.length === 0) return;
    const p = this.prisma as any;
    if (!p.workOrderTask?.count || !p.workOrderTask?.createMany) return;

    try {
      const orden = await this.prisma.workOrder.findUnique({ where: { scanId } });
      if (!orden) return;

      const existentes = await p.workOrderTask.count({
        where: { workOrderId: orden.id },
      });
      if (existentes > 0) return;

      await p.workOrderTask.createMany({
        data: verificationSteps.map((step) => ({
          workOrderId: orden.id,
          description: step.trim(),
          completed: false,
        })),
      });
    } catch {
      // Silencioso si no está disponible en mocks
    }
  }
}
