import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { normalizarVin, vinEnConflicto } from './vin-check';
import {
  ScanSeverity,
  VehicleStatus,
  WorkOrderStatus,
} from '@prisma/client';
import {
  dictamenSecuelaDeReparacion,
  inicioVentanaReparacion,
  pareceSecuelaDeReparacion,
} from './post-reparacion';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateScanDto } from './dto/create-scan.dto';
import { DeterministicFilterService } from '../obd/deterministic-filter.service';
import { DiagnosisService, VENTANA_HISTORIAL } from '../diagnosis/diagnosis.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { resolverEstadoVehiculo } from './vehicle-status';
import { N8nService } from '../n8n/n8n.service';
import { PushService } from '../push/push.service';

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filterService: DeterministicFilterService,
    private readonly diagnosisService: DiagnosisService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly n8nService: N8nService,
    private readonly pushService: PushService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async findAll(inspectorId?: string) {
    let where: Record<string, any> = {};
    if (inspectorId) {
      const inspector = await this.prisma.user?.findUnique({
        where: { id: inspectorId },
        select: { unitId: true },
      });
      where = inspector?.unitId
        ? { vehicle: { unitId: inspector.unitId } }
        : { vehicle: { responsibleId: inspectorId } };
    }

    const scans = await this.prisma.scan.findMany({
      where,
      orderBy: { scannedAt: 'desc' },
      include: {
        vehicle: true,
        scannedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        dtcEntries: true,
        diagnosis: true,
        workOrder: true,
      },
    });

    return scans.map((scan) => ({
      ...scan,
      dtcEntries: scan.dtcEntries.map((entry) => ({
        ...entry,
        description: this.filterService.getDtcDescription(entry.code),
      })),
    }));
  }

  async findOne(id: string) {
    const scan = await this.prisma.scan.findUnique({
      where: { id },
      include: {
        vehicle: true,
        scannedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        dtcEntries: true,
        diagnosis: true,
        workOrder: true,
      },
    });

    if (!scan) {
      throw new NotFoundException(`Escaneo con ID ${id} no encontrado`);
    }

    return {
      ...scan,
      dtcEntries: scan.dtcEntries.map((entry) => ({
        ...entry,
        description: this.filterService.getDtcDescription(entry.code),
      })),
    };
  }

  async create(dto: CreateScanDto, userId: string) {
    // 0. Una lectura incompleta no es un escaneo: registrarla dejaría como
    //    operativo un vehículo que en realidad no se pudo leer.
    if (dto.complete === false) {
      throw new BadRequestException(
        'El escaneo está incompleto: no se pudieron leer los monitores o los códigos de falla. Vuelva a escanear el vehículo.',
      );
    }

    // 1. Resolver vehículo por vehicleId o por VIN
    let vehicle = null;
    if (dto.vehicleId) {
      vehicle = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicleId },
      });
    } else if (dto.vin) {
      vehicle = await this.prisma.vehicle.findUnique({
        where: { vin: dto.vin.trim().toUpperCase() },
      });
    }

    if (!vehicle) {
      throw new BadRequestException(
        'Debe proporcionar un vehicleId válido o un VIN registrado en el sistema.',
      );
    }

    if (!vehicle.active) {
      throw new BadRequestException(
        `El vehículo ${vehicle.plate} está dado de baja y no admite nuevos escaneos.`,
      );
    }

    // 1.1 El vehículo elegido a mano debe ser el mismo que reporta la ECU.
    if (dto.vehicleId && vinEnConflicto(vehicle.vin, dto.vin)) {
      throw new ConflictException(
        `El VIN leído (${normalizarVin(dto.vin)}) no corresponde al vehículo seleccionado ` +
          `(${vehicle.plate}, VIN ${vehicle.vin}). Verifique el vehículo antes de registrar el escaneo.`,
      );
    }

    // 2. El escaneo se atribuye al usuario del token. Sin fallback: un escaneo
    //    sin autor identificado no tiene valor como registro técnico.
    if (!userId) {
      throw new UnauthorizedException(
        'No se pudo identificar al usuario que realiza el escaneo.',
      );
    }
    const scannedById = userId;

    // 3. Historial para detectar recurrencia.
    //    Se miran los últimos VENTANA_HISTORIAL escaneos y no solo el anterior:
    //    comparar contra uno solo no detecta fallas intermitentes que aparecen,
    //    desaparecen y vuelven, que es el patrón que interesa a un sistema
    //    preventivo. Antes, además, dos escaneos seguidos el mismo día se
    //    marcaban como "recurrencia histórica" y escalaban a CRÍTICO.
    const previousScans = await this.prisma.scan.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { scannedAt: 'desc' },
      take: VENTANA_HISTORIAL,
      include: { dtcEntries: { select: { code: true } } },
    });

    const previousDtcCodes = Array.from(
      new Set(
        previousScans.flatMap((s) =>
          s.dtcEntries.map((e) => e.code.trim().toUpperCase()),
        ),
      ),
    );

    // 4. Ejecutar Filtro Determinístico (Capa 1)
    let evaluation = this.filterService.evaluateScan({
      dtcs: dto.dtcs || [],
      readinessStatus: dto.readinessStatus,
      previousDtcCodes,
      batteryVoltage: dto.batteryVoltage,
    });

    // 4.1 Falsa alarma tras reparar: un código PERMANENTE con monitores
    //     incompletos, poco después de cerrar una orden como completada, es lo
    //     esperable mientras la ECU completa sus ciclos. No abre orden ni pide
    //     hipótesis. Cualquier CONFIRMED o PENDING sigue las reglas de siempre.
    evaluation = await this.considerarReparacionReciente(vehicle.id, dto, evaluation);

    // 5. Persistir Scan + DtcEntries y actualizar estado del vehículo
    const codigosEntrada = (dto.dtcs || []).map((d) => d.code.trim().toUpperCase());
    const codigosEnCatalogo = new Set<string>();
    const p = this.prisma as any;
    if (codigosEntrada.length > 0 && p.dtcCatalog?.findMany) {
      try {
        const encontrados = await p.dtcCatalog.findMany({
          where: { code: { in: codigosEntrada } },
          select: { code: true },
        });
        for (const c of encontrados) codigosEnCatalogo.add(c.code);
      } catch {
        // Silencioso en mocks de prueba
      }
    }

    const createdScan = await this.prisma.scan.create({
      data: {
        vehicleId: vehicle.id,
        scannedById,
        batteryVoltage: dto.batteryVoltage ?? null,
        scannedAt: dto.scannedAt ? new Date(dto.scannedAt) : new Date(),
        readinessStatus: dto.readinessStatus ? (dto.readinessStatus as any) : null,
        protocol: dto.protocol ? (dto.protocol as any) : null,
        rawPayload: dto.rawPayload ? (dto.rawPayload as any) : (dto as any),
        // Dos campos distintos: antes la observación del inspector
        // reemplazaba al dictamen, y la IA la recibía como si fuera el dictamen.
        notes: dto.notes?.trim() || null,
        rationale: evaluation.rationale,
        severity: evaluation.severity,
        aiProcessed: false,
        dtcEntries: {
          create: (dto.dtcs || []).map((dtc) => {
            const normalized = dtc.code.trim().toUpperCase();
            return {
              code: normalized,
              type: dtc.type,
              ...(codigosEnCatalogo.has(normalized)
                ? { catalogCode: normalized }
                : {}),
            };
          }),
        },
      },
      include: {
        vehicle: true,
        dtcEntries: true,
        scannedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    void this.auditService?.record({
      userId: scannedById,
      action: 'SCAN',
      entity: 'SCAN',
      entityId: createdScan.id,
      summary: `Escaneo OBD-II registrado para ${vehicle.plate} — Severidad: ${evaluation.severity} (${createdScan.dtcEntries.length} códigos)`,
    });

    // 6. Crear o actualizar la orden de evaluación ANTES de llamar a la IA.
    //    Así la orden existe aunque el proveedor falle o no haya crédito: su
    //    justificación es el dictamen determinístico, y la hipótesis solo la
    //    enriquece después.
    let workOrderId: string | null = null;
    if (evaluation.requiresAiEvaluation) {
      const { orden, creada } = await this.workOrdersService.createOrUpdateForScan({
        vehicleId: vehicle.id,
        scanId: createdScan.id,
        severity: evaluation.severity,
        rationale: evaluation.rationale,
        codes: createdScan.dtcEntries.map((e) => e.code),
      });
      workOrderId = creada ? orden.id : null;

      // Avisos solo por órdenes nuevas (una recurrencia no vuelve a avisar):
      // n8n envía Telegram y correo, y el backend envía el push al celular.
      // En segundo plano y sin lanzar: si alguno no responde, el escaneo
      // queda registrado igual, y el aviso de n8n se reenvía desde la orden.
      if (creada) {
        void this.n8nService.notificarAlerta(orden.id);
        void this.pushService.notificarOrden(orden.id);
      }
    }

    // 7. Estado del vehículo, respetando las órdenes abiertas.
    const vehicleStatus = await this.resolveVehicleStatus(
      vehicle.id,
      evaluation.vehicleStatus,
      vehicle.status,
    );

    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: vehicleStatus },
    });

    // 8. Hipótesis de IA en segundo plano: la llamada al proveedor tarda del
    //    orden de 15 segundos y el inspector no debe esperar con el teléfono en
    //    la mano. `processScan` nunca lanza; registra el fallo y deja el
    //    escaneo reintentable.
    if (evaluation.requiresAiEvaluation) {
      void this.diagnosisService.processScan(createdScan.id);
    }

    return {
      scan: {
        ...createdScan,
        vehicle: {
          ...createdScan.vehicle,
          status: vehicleStatus,
        },
      },
      evaluation,
      diagnosis: {
        requested: evaluation.requiresAiEvaluation,
        status: evaluation.requiresAiEvaluation ? 'generando' : 'no requerida',
      },
      workOrderId,
    };
  }

  /**
   * Si el escaneo parece la secuela de una reparación reciente, devuelve la
   * evaluación ajustada: ALERT, sin IA y con un dictamen que lo explica.
   *
   * La severidad queda en LOW (el filtro le daría MEDIUM): con MEDIUM y sin
   * hipótesis, la web lo mostraría como una hipótesis fallida por reintentar.
   */
  private async considerarReparacionReciente<
    T extends {
      severity: ScanSeverity;
      vehicleStatus: VehicleStatus;
      requiresAiEvaluation: boolean;
      rationale: string;
    },
  >(vehicleId: string, dto: CreateScanDto, evaluation: T): Promise<T> {
    const dtcs = dto.dtcs || [];
    if (
      !pareceSecuelaDeReparacion(dtcs, dto.readinessStatus?.monitorsCompleted)
    ) {
      return evaluation;
    }

    const reparacion = await this.prisma.workOrder.findFirst({
      where: {
        vehicleId,
        status: WorkOrderStatus.COMPLETED,
        closedAt: { gte: inicioVentanaReparacion() },
      },
      orderBy: { closedAt: 'desc' },
      select: { closedAt: true },
    });
    if (!reparacion?.closedAt) {
      return evaluation;
    }

    return {
      ...evaluation,
      severity: ScanSeverity.LOW,
      vehicleStatus: VehicleStatus.ALERT,
      requiresAiEvaluation: false,
      rationale: dictamenSecuelaDeReparacion(
        Array.from(new Set(dtcs.map((d) => d.code.trim().toUpperCase()))),
        reparacion.closedAt,
        dto.readinessStatus?.incompleteMonitors ?? [],
      ),
    };
  }

  private async resolveVehicleStatus(
    vehicleId: string,
    calculado: VehicleStatus,
    actual: VehicleStatus,
  ): Promise<VehicleStatus> {
    const abiertas = await this.workOrdersService.countOpenByVehicle(vehicleId);
    return resolverEstadoVehiculo(calculado, actual, abiertas > 0);
  }
}
