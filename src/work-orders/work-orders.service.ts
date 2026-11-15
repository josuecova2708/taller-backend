import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ScanSeverity,
  UserRole,
  VehicleStatus,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleStatusService } from '../obd/vehicle-status.service';
import { Permission, roleHasPermission } from '../auth/permissions';
import { getDtcDescription } from '../obd/dtc-dictionary';

/** Quién ejecuta la operación, tal como viene en el token. */
export interface Actor {
  sub: string;
  role: string;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Agrega una entrada al historial de notas sin borrar las anteriores. */
export function agregarNota(
  previas: string | null | undefined,
  nueva: string,
): string {
  return [previas?.trim(), nueva].filter(Boolean).join('\n');
}

/** Estados en los que una orden se considera viva y no debe duplicarse. */
export const ESTADOS_ABIERTOS: WorkOrderStatus[] = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.IN_PROGRESS,
];

const SEVERIDAD_A_PRIORIDAD: Record<ScanSeverity, WorkOrderPriority> = {
  [ScanSeverity.NONE]: WorkOrderPriority.LOW,
  [ScanSeverity.LOW]: WorkOrderPriority.LOW,
  [ScanSeverity.MEDIUM]: WorkOrderPriority.MEDIUM,
  [ScanSeverity.HIGH]: WorkOrderPriority.HIGH,
  [ScanSeverity.CRITICAL]: WorkOrderPriority.CRITICAL,
};

const ORDEN_PRIORIDAD: WorkOrderPriority[] = [
  WorkOrderPriority.LOW,
  WorkOrderPriority.MEDIUM,
  WorkOrderPriority.HIGH,
  WorkOrderPriority.CRITICAL,
];

export function prioridadDesdeSeveridad(severity: ScanSeverity): WorkOrderPriority {
  return SEVERIDAD_A_PRIORIDAD[severity] ?? WorkOrderPriority.MEDIUM;
}

/** Devuelve la mayor de dos prioridades; una orden nunca se degrada sola. */
export function prioridadMasAlta(
  a: WorkOrderPriority,
  b: WorkOrderPriority,
): WorkOrderPriority {
  return ORDEN_PRIORIDAD.indexOf(a) >= ORDEN_PRIORIDAD.indexOf(b) ? a : b;
}

export interface EntradaOrden {
  vehicleId: string;
  scanId: string;
  severity: ScanSeverity;
  /** Dictamen determinístico; es la justificación cuando la IA no responde. */
  rationale: string;
  codes: string[];
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleStatusService: VehicleStatusService,
  ) {}

  async findAll() {
    return this.prisma.workOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: true,
        diagnosis: true,
        scan: { include: { dtcEntries: true } },
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
        closedBy: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const orden = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        vehicle: true,
        diagnosis: true,
        scan: { include: { dtcEntries: true } },
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
        closedBy: { select: { id: true, name: true } },
      },
    });

    if (!orden) {
      throw new NotFoundException(`Orden de trabajo ${id} no encontrada`);
    }

    // Los códigos salen con su descripción, igual que en el detalle del escaneo.
    if (orden.scan?.dtcEntries) {
      orden.scan.dtcEntries = orden.scan.dtcEntries.map((entry) => ({
        ...entry,
        description: getDtcDescription(entry.code),
      }));
    }

    return orden;
  }

  /** Órdenes vivas de un vehículo, de la más reciente a la más antigua. */
  async findOpenByVehicle(vehicleId: string) {
    return this.prisma.workOrder.findMany({
      where: { vehicleId, status: { in: ESTADOS_ABIERTOS } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countOpenByVehicle(vehicleId: string): Promise<number> {
    return this.prisma.workOrder.count({
      where: { vehicleId, status: { in: ESTADOS_ABIERTOS } },
    });
  }

  /**
   * Crea una orden de evaluación, o actualiza la que ya está abierta.
   *
   * Regla de deduplicación: si el vehículo ya tiene una orden OPEN o
   * IN_PROGRESS, un escaneo nuevo con la misma falla NO genera otra orden. Sin
   * esto, un bus escaneado cada semana sin reparar acumularía una orden abierta
   * por semana y el tablero perdería sentido.
   *
   * Al actualizar: la prioridad solo puede subir (una falla que reaparece no es
   * menos grave que antes) y se registra la recurrencia en las notas. El
   * `scanId` sigue apuntando al escaneo que originó la orden, que es lo que
   * permite rastrear desde cuándo existe el problema.
   */
  async createOrUpdateForScan(entrada: EntradaOrden): Promise<{
    orden: WorkOrder;
    creada: boolean;
  }> {
    const [existente] = await this.findOpenByVehicle(entrada.vehicleId);
    const prioridad = prioridadDesdeSeveridad(entrada.severity);

    if (existente) {
      const nuevaPrioridad = prioridadMasAlta(existente.priority, prioridad);
      const codigos = entrada.codes.length > 0 ? entrada.codes.join(', ') : 'sin códigos';
      const nota = agregarNota(
        existente.notes,
        `[${hoy()}] Reaparece en un escaneo posterior (${codigos}). ` +
          `Severidad del nuevo escaneo: ${entrada.severity}.`,
      );

      const orden = await this.prisma.workOrder.update({
        where: { id: existente.id },
        data: { priority: nuevaPrioridad, notes: nota },
      });

      this.logger.log(
        `Orden ${orden.id} actualizada por recurrencia ` +
          `(prioridad ${existente.priority} -> ${nuevaPrioridad})`,
      );

      return { orden, creada: false };
    }

    const orden = await this.prisma.workOrder.create({
      data: {
        scanId: entrada.scanId,
        vehicleId: entrada.vehicleId,
        priority: prioridad,
        status: WorkOrderStatus.OPEN,
        description: this.construirDescripcion(entrada),
      },
    });

    this.logger.log(
      `Orden ${orden.id} creada para el vehículo ${entrada.vehicleId} ` +
        `(prioridad ${prioridad})`,
    );

    return { orden, creada: true };
  }

  /**
   * Crea una orden a mano para un escaneo que no generó una (CU13, flujo
   * alterno). Es el caso de una severidad leve que el administrador igual
   * quiere que revise un mecánico.
   *
   * Respeta las mismas reglas que la creación automática: un escaneo tiene a
   * lo sumo una orden, y un vehículo no acumula órdenes abiertas.
   */
  async createManual(
    scanId: string,
    descripcion: string | undefined,
    actor: Actor,
  ): Promise<WorkOrder> {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        vehicle: true,
        dtcEntries: true,
        workOrder: true,
        diagnosis: { select: { id: true } },
      },
    });

    if (!scan) {
      throw new NotFoundException('El escaneo indicado no existe.');
    }
    if (scan.workOrder) {
      throw new ConflictException('Este escaneo ya tiene una orden de trabajo.');
    }
    if (!scan.vehicle.active) {
      throw new BadRequestException(
        `El vehículo ${scan.vehicle.plate} está dado de baja.`,
      );
    }

    const [abierta] = await this.findOpenByVehicle(scan.vehicleId);
    if (abierta) {
      throw new ConflictException(
        `El vehículo ${scan.vehicle.plate} ya tiene una orden de trabajo abierta. ` +
          'Registre la novedad en esa orden.',
      );
    }

    const autor = await this.nombreDe(actor.sub);
    const orden = await this.prisma.workOrder.create({
      data: {
        scanId,
        vehicleId: scan.vehicleId,
        diagnosisId: scan.diagnosis?.id ?? null,
        priority: prioridadDesdeSeveridad(scan.severity),
        status: WorkOrderStatus.OPEN,
        description:
          descripcion?.trim() ||
          this.construirDescripcion({
            vehicleId: scan.vehicleId,
            scanId,
            severity: scan.severity,
            rationale:
              scan.rationale ?? scan.notes ?? 'Revisión solicitada por el administrador.',
            codes: scan.dtcEntries.map((e) => e.code),
          }),
        notes: `[${hoy()}] Orden creada a mano por ${autor}.`,
      },
    });

    // Con una orden abierta el vehículo deja de figurar como operativo sin más.
    if (scan.vehicle.status === VehicleStatus.OK) {
      await this.prisma.vehicle.update({
        where: { id: scan.vehicleId },
        data: { status: VehicleStatus.ALERT },
      });
    }

    this.logger.log(`Orden ${orden.id} creada a mano por ${actor.sub}`);
    return orden;
  }

  /**
   * Vincula la hipótesis de IA a la orden, una vez que el proveedor respondió.
   *
   * La orden se crea antes de llamar a la IA, con el dictamen determinístico
   * como justificación. Esto la enriquece después, y si la IA nunca responde la
   * orden sigue siendo válida.
   */
  async attachDiagnosis(
    workOrderId: string,
    diagnosisId: string,
    resumen: string,
  ): Promise<WorkOrder> {
    return this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        diagnosisId,
        description: resumen,
      },
    });
  }

  /**
   * Avanza la orden entre estados no terminales (OPEN <-> IN_PROGRESS).
   *
   * Es la operación del mecánico: puede registrar que empezó a trabajar y
   * dejar notas, pero no cerrar la orden. Cerrarla habilita al vehículo a
   * volver a operar y es una decisión con otro nivel de responsabilidad
   * (permiso `order:close`), por eso vive en otro endpoint.
   *
   * Solo el mecánico ASIGNADO puede avanzarla. Quien administra las órdenes
   * (permiso `order:assign`) también, para poder destrabar una orden.
   *
   * La nota se AGREGA al historial con fecha y autor: antes reemplazaba todo
   * el campo, y un mecánico podía borrar sin querer lo que escribió otro.
   */
  async advanceStatus(
    id: string,
    status: WorkOrderStatus,
    notes: string | undefined,
    actor: Actor,
  ): Promise<WorkOrder> {
    const orden = await this.findOne(id);

    if (!ESTADOS_ABIERTOS.includes(orden.status)) {
      throw new ConflictException(
        `La orden ya está ${orden.status} y no puede reabrirse desde este endpoint.`,
      );
    }

    const administra = roleHasPermission(
      actor.role as UserRole,
      Permission.ORDER_ASSIGN,
    );
    if (!administra && orden.assignedToId !== actor.sub) {
      throw new ForbiddenException(
        orden.assignedToId
          ? 'Esta orden está asignada a otro mecánico.'
          : 'Esta orden todavía no tiene mecánico asignado. Solicite la asignación al administrador.',
      );
    }

    const nota = notes?.trim();
    const data: { status: WorkOrderStatus; notes?: string } = { status };
    if (nota) {
      const autor = await this.nombreDe(actor.sub);
      data.notes = agregarNota(orden.notes, `[${hoy()}] ${autor}: ${nota}`);
    }

    return this.prisma.workOrder.update({ where: { id }, data });
  }

  /**
   * Cierra la orden y decide el estado del vehículo.
   *
   * Cerrar y autorizar son dos decisiones distintas:
   *
   * - Sin autorización, el estado se recalcula desde el último escaneo. Si ese
   *   escaneo sigue siendo crítico, el vehículo permanece crítico hasta que un
   *   escaneo posterior confirme la reparación.
   * - Con autorización (`vehicle:authorize`), el responsable asume formalmente
   *   que el vehículo puede volver a operar y pasa a OK. Queda registrado
   *   quién lo autorizó y cuándo.
   *
   * En ambos casos, si al vehículo le quedan otras órdenes abiertas su estado
   * no cambia: la condición sigue sin resolverse.
   */
  async close(
    id: string,
    status: WorkOrderStatus,
    resolution: string,
    actor: Actor,
    authorizeOperation = false,
  ): Promise<{
    orden: WorkOrder;
    vehicleStatus: VehicleStatus | null;
    operationAuthorized: boolean;
  }> {
    const orden = await this.findOne(id);

    if (!ESTADOS_ABIERTOS.includes(orden.status)) {
      throw new ConflictException(`La orden ya está cerrada (${orden.status}).`);
    }

    const justificacion = resolution?.trim();
    if (!justificacion) {
      throw new BadRequestException('La nota de cierre es obligatoria.');
    }

    if (authorizeOperation) {
      if (
        !roleHasPermission(actor.role as UserRole, Permission.VEHICLE_AUTHORIZE)
      ) {
        throw new ForbiddenException(
          'Su rol no puede autorizar la operación del vehículo.',
        );
      }
      if (status !== WorkOrderStatus.COMPLETED) {
        throw new BadRequestException(
          'Solo se puede autorizar la operación al completar la orden, no al cancelarla.',
        );
      }
    }

    const autor = await this.nombreDe(actor.sub);
    const notas = agregarNota(
      orden.notes,
      `[${hoy()}] Cierre (${status}) por ${autor}: ${justificacion}` +
        (authorizeOperation ? ' — Operación del vehículo autorizada.' : ''),
    );

    const cerrada = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status,
        notes: notas,
        closedById: actor.sub,
        closedAt: new Date(),
        operationAuthorized: authorizeOperation,
      },
    });

    let vehicleStatus: VehicleStatus | null;
    const otrasAbiertas = await this.countOpenByVehicle(orden.vehicleId);

    if (authorizeOperation && otrasAbiertas === 0) {
      await this.prisma.vehicle.update({
        where: { id: orden.vehicleId },
        data: { status: VehicleStatus.OK },
      });
      vehicleStatus = VehicleStatus.OK;
    } else {
      vehicleStatus = await this.vehicleStatusService.recomputeForVehicle(
        orden.vehicleId,
      );
    }

    this.logger.log(
      `Orden ${id} cerrada como ${status} por ${actor.sub}` +
        `${authorizeOperation ? ' con autorización de operación' : ''}. ` +
        `Estado del vehículo: ${vehicleStatus ?? 'sin cambios'}.`,
    );

    return {
      orden: cerrada,
      vehicleStatus,
      operationAuthorized: authorizeOperation && otrasAbiertas === 0,
    };
  }

  /**
   * Asigna la orden a un mecánico, o retira la asignación con `null`.
   *
   * Una orden cerrada no se reasigna, y el destinatario debe ser un mecánico
   * con la cuenta activa: asignarla a un inspector la dejaría sin nadie que
   * pueda avanzarla.
   */
  async assign(id: string, assignedToId: string | null): Promise<WorkOrder> {
    const orden = await this.findOne(id);

    if (!ESTADOS_ABIERTOS.includes(orden.status)) {
      throw new ConflictException(
        `La orden ya está cerrada (${orden.status}) y no puede asignarse.`,
      );
    }

    if (assignedToId) {
      const usuario = await this.prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true, role: true, active: true },
      });

      if (!usuario) {
        throw new NotFoundException('El usuario indicado no existe.');
      }
      if (usuario.role !== UserRole.MECHANIC) {
        throw new BadRequestException(
          'La orden solo puede asignarse a un usuario con rol de mecánico.',
        );
      }
      if (!usuario.active) {
        throw new BadRequestException('El mecánico indicado está desactivado.');
      }
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: { assignedToId },
    });
  }

  private async nombreDe(userId: string): Promise<string> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return usuario?.name ?? 'Usuario desconocido';
  }

  private construirDescripcion(entrada: EntradaOrden): string {
    const codigos =
      entrada.codes.length > 0
        ? `Códigos: ${entrada.codes.join(', ')}. `
        : '';
    return `${codigos}${entrada.rationale}`;
  }
}
