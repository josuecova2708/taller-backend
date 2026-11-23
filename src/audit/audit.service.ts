import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento en la bitácora general del sistema (audit_logs).
   * Nunca lanza excepción para no interrumpir la operación principal.
   */
  async record(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          summary: input.summary,
          metadata: input.metadata ? (input.metadata as any) : undefined,
        },
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo registrar en bitácora (${input.action} ${input.entity}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  async findAllAuditLogs(filters?: { entity?: string; action?: string; limit?: number }) {
    const take = Math.min(filters?.limit || 100, 300);
    return this.prisma.auditLog.findMany({
      where: {
        ...(filters?.entity ? { entity: filters.entity } : {}),
        ...(filters?.action ? { action: filters.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async findAllNotificationLogs(limit = 100) {
    return this.prisma.notificationLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: Math.min(limit, 300),
      include: {
        workOrder: {
          select: {
            id: true,
            status: true,
            priority: true,
            vehicle: { select: { plate: true, alias: true } },
          },
        },
        recipient: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }
}
