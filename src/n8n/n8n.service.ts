import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { construirAlerta, construirResumen } from './n8n.messages';

/** Tiempo máximo de espera al webhook: n8n responde apenas recibe. */
const TIMEOUT_MS = 8000;

export interface ResultadoAviso {
  enviado: boolean;
  /** Por qué no se envió, en palabras que se le pueden mostrar al usuario. */
  motivo?: string;
}

/**
 * Puente con n8n, que es quien envía los avisos por Telegram y correo.
 *
 * El backend solo le entrega el evento ya redactado. Si n8n no responde, el
 * escaneo y la orden quedan registrados igual: el aviso es un complemento y
 * se puede reenviar después desde la orden.
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get urlWeb(): string | undefined {
    return this.configService.get<string>('APP_PUBLIC_URL')?.trim() || undefined;
  }

  /**
   * Avisa a n8n que se creó una orden de trabajo (CU17).
   *
   * Nunca lanza: devuelve si se envió y, si no, el motivo. Al recibir un 2xx
   * marca la orden con `n8nNotified = true`.
   */
  async notificarAlerta(workOrderId: string): Promise<ResultadoAviso> {
    const url = this.configService.get<string>('N8N_WEBHOOK_URL')?.trim();
    if (!url) {
      return { enviado: false, motivo: 'Los avisos por n8n no están configurados.' };
    }

    try {
      const orden = await this.prisma.workOrder.findUnique({
        where: { id: workOrderId },
        include: {
          vehicle: {
            select: {
              plate: true,
              alias: true,
              responsible: { select: { name: true } },
            },
          },
          assignedTo: { select: { name: true } },
          scan: { include: { dtcEntries: { select: { code: true } } } },
        },
      });
      if (!orden) {
        return { enviado: false, motivo: 'La orden de trabajo no existe.' };
      }

      const secreto = this.configService.get<string>('N8N_WEBHOOK_SECRET')?.trim();
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secreto ? { 'X-Webhook-Secret': secreto } : {}),
        },
        body: JSON.stringify(construirAlerta(orden, this.urlWeb)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!respuesta.ok) {
        this.logger.warn(
          `n8n respondió ${respuesta.status} al aviso de la orden ${workOrderId}`,
        );
        await this.registrarNotificacion(
          workOrderId,
          `Alerta de orden para ${orden.vehicle.plate}`,
          'FAILED',
          `HTTP ${respuesta.status}`,
        );
        return {
          enviado: false,
          motivo: `El servicio de avisos respondió con un error (${respuesta.status}).`,
        };
      }

      await this.prisma.workOrder.update({
        where: { id: workOrderId },
        data: { n8nNotified: true },
      });
      await this.registrarNotificacion(
        workOrderId,
        `Alerta de orden para ${orden.vehicle.plate} (Telegram + Email vía n8n)`,
        'SENT',
      );
      this.logger.log(`Aviso de la orden ${workOrderId} entregado a n8n`);
      return { enviado: true };
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar a n8n de la orden ${workOrderId}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      await this.registrarNotificacion(
        workOrderId,
        `Alerta de orden ${workOrderId.slice(0, 8)}`,
        'FAILED',
        error instanceof Error ? error.message : String(error),
      );
      return { enviado: false, motivo: 'No se pudo conectar con el servicio de avisos.' };
    }
  }

  private async registrarNotificacion(
    workOrderId: string,
    subject: string,
    status: 'SENT' | 'FAILED',
    errorDetail?: string,
  ): Promise<void> {
    const p = this.prisma as any;
    if (!p.notificationLog?.create) return;
    try {
      await p.notificationLog.create({
        data: {
          workOrderId,
          channel: 'TELEGRAM',
          status,
          subject,
          errorDetail: errorDetail || null,
        },
      });
    } catch {
      // Silencioso en mocks
    }
  }

  /** Datos y texto del resumen diario, que n8n pide con su temporizador (CU19). */
  async resumenDiario(ahora: Date = new Date()) {
    const [ordenes, vehiculos] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] } },
        include: {
          vehicle: {
            select: {
              plate: true,
              alias: true,
              responsible: { select: { name: true } },
            },
          },
          assignedTo: { select: { name: true } },
        },
      }),
      this.prisma.vehicle.findMany({
        where: { active: true },
        select: {
          plate: true,
          alias: true,
          responsible: { select: { name: true } },
          scans: {
            orderBy: { scannedAt: 'desc' },
            take: 1,
            select: { scannedAt: true },
          },
        },
      }),
    ]);

    return construirResumen(ordenes, vehiculos, ahora, this.urlWeb);
  }
}
