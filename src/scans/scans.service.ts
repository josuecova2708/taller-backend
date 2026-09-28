import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScanDto } from './dto/create-scan.dto';
import { DeterministicFilterService } from './deterministic-filter.service';

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filterService: DeterministicFilterService,
  ) {}

  async findAll() {
    const scans = await this.prisma.scan.findMany({
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

    // 2. El escaneo se atribuye al usuario del token. Sin fallback: un escaneo
    //    sin autor identificado no tiene valor como registro técnico.
    if (!userId) {
      throw new UnauthorizedException(
        'No se pudo identificar al usuario que realiza el escaneo.',
      );
    }
    const scannedById = userId;

    // 3. Consultar último escaneo del mismo vehículo para detectar recurrencia
    const lastScan = await this.prisma.scan.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: { scannedAt: 'desc' },
      include: { dtcEntries: true },
    });

    const previousDtcCodes = lastScan
      ? lastScan.dtcEntries.map((e) => e.code)
      : [];

    // 4. Ejecutar Filtro Determinístico (Capa 1)
    const evaluation = this.filterService.evaluateScan({
      dtcs: dto.dtcs || [],
      readinessStatus: dto.readinessStatus,
      previousDtcCodes,
      batteryVoltage: dto.batteryVoltage,
    });

    // 5. Persistir Scan + DtcEntries y actualizar estado del vehículo
    const createdScan = await this.prisma.scan.create({
      data: {
        vehicleId: vehicle.id,
        scannedById,
        batteryVoltage: dto.batteryVoltage ?? null,
        scannedAt: dto.scannedAt ? new Date(dto.scannedAt) : new Date(),
        readinessStatus: dto.readinessStatus ? (dto.readinessStatus as any) : null,
        rawPayload: dto.rawPayload ? (dto.rawPayload as any) : (dto as any),
        notes: dto.notes || evaluation.rationale,
        severity: evaluation.severity,
        aiProcessed: false,
        dtcEntries: {
          create: (dto.dtcs || []).map((dtc) => ({
            code: dtc.code.trim().toUpperCase(),
            type: dtc.type,
          })),
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

    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: evaluation.vehicleStatus },
    });

    return {
      scan: {
        ...createdScan,
        vehicle: {
          ...createdScan.vehicle,
          status: evaluation.vehicleStatus,
        },
      },
      evaluation,
    };
  }
}
