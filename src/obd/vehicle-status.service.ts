import { Injectable, Logger } from '@nestjs/common';
import { Prisma, VehicleStatus, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeterministicFilterService } from './deterministic-filter.service';
import { DtcItemDto, ReadinessStatusDto } from '../scans/dto/create-scan.dto';

/** Estados en los que una orden se considera viva. */
const ESTADOS_ABIERTOS: WorkOrderStatus[] = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.IN_PROGRESS,
];

/**
 * Recalcula el estado de un vehículo a partir de la evidencia almacenada.
 *
 * Existe por la contracara de una regla del sistema: mientras un vehículo tiene
 * una orden abierta, un escaneo limpio NO lo devuelve a OK (si no, bastaría con
 * borrar los códigos o desconectar la batería para ponerlo en verde). Esa regla
 * necesita su complemento cuando una orden se CANCELA: el estado vuelve a
 * derivarse de los datos, o el vehículo quedaría en rojo para siempre.
 *
 * Cuando la orden se cierra como COMPLETADA no se usa este recálculo: el
 * mecánico que la cierra asume que el vehículo quedó reparado y vuelve a OK
 * (ver `WorkOrdersService.close`). Queda registrado quién la cerró.
 *
 * Vive en `ObdModule` y no en `ScansModule` porque lo consumen tanto los
 * escaneos como las órdenes de trabajo, y tenerlo en uno de los dos creaba una
 * dependencia circular entre ambos módulos.
 */
@Injectable()
export class VehicleStatusService {
  private readonly logger = new Logger(VehicleStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filterService: DeterministicFilterService,
  ) {}

  /**
   * Vuelve a derivar el estado del vehículo desde su último escaneo.
   *
   * No hace nada si todavía quedan órdenes abiertas: en ese caso la condición
   * sigue sin resolverse y el estado debe mantenerse.
   *
   * Se usa al cancelar una orden: cancelar no es reparar, así que un vehículo
   * cuyo último escaneo fue CRÍTICO sigue en CRÍTICO hasta que un escaneo
   * posterior muestre otra cosa.
   */
  async recomputeForVehicle(vehicleId: string): Promise<VehicleStatus | null> {
    const abiertas = await this.prisma.workOrder.count({
      where: { vehicleId, status: { in: ESTADOS_ABIERTOS } },
    });

    if (abiertas > 0) {
      this.logger.log(
        `Vehículo ${vehicleId}: quedan ${abiertas} orden(es) abierta(s), no se recalcula el estado.`,
      );
      return null;
    }

    const ultimo = await this.prisma.scan.findFirst({
      where: { vehicleId },
      orderBy: { scannedAt: 'desc' },
      include: { dtcEntries: true },
    });

    // Sin escaneos no hay evidencia sobre la que decidir: se deja en OK, que es
    // el valor por defecto de un vehículo recién registrado.
    if (!ultimo) {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: { status: VehicleStatus.OK },
      });
      return VehicleStatus.OK;
    }

    const previos = await this.prisma.scan.findMany({
      where: {
        vehicleId,
        id: { not: ultimo.id },
        scannedAt: { lt: ultimo.scannedAt },
      },
      orderBy: { scannedAt: 'desc' },
      take: 3,
      include: { dtcEntries: { select: { code: true } } },
    });

    const previousDtcCodes = Array.from(
      new Set(previos.flatMap((p) => p.dtcEntries.map((d) => d.code))),
    );

    // Se re-ejecuta el filtro determinístico en lugar de mapear la severidad
    // almacenada: la severidad no determina el estado por sí sola (un HIGH
    // puede corresponder a ALERT o a CRITICAL según la regla que lo produjo).
    const evaluation = this.filterService.evaluateScan({
      dtcs: ultimo.dtcEntries.map(
        (e): DtcItemDto => ({ code: e.code, type: e.type }),
      ),
      readinessStatus: this.leerReadiness(ultimo.readinessStatus),
      previousDtcCodes,
      batteryVoltage: ultimo.batteryVoltage ?? undefined,
    });

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: evaluation.vehicleStatus },
    });

    this.logger.log(
      `Vehículo ${vehicleId}: sin órdenes abiertas, estado recalculado a ${evaluation.vehicleStatus} ` +
        `desde el escaneo ${ultimo.id} (severidad ${ultimo.severity}).`,
    );

    return evaluation.vehicleStatus;
  }

  /** `readinessStatus` es una columna JSON: se lee defensivamente. */
  private leerReadiness(
    valor: Prisma.JsonValue | null,
  ): ReadinessStatusDto | undefined {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
      return undefined;
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
    };
  }
}
