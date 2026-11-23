import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { UserRole, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

/** Lo que sale por la API del responsable de un vehículo. */
export const RESPONSABLE_PUBLICO = {
  select: { id: true, name: true, email: true },
} as const;

export const RELACIONES_VEHICULO = {
  responsible: RESPONSABLE_PUBLICO,
  category: { select: { id: true, name: true, inspectionCycleDays: true } },
  unit: { select: { id: true, name: true, code: true, type: true } },
  vehicleModel: {
    select: {
      id: true,
      name: true,
      engineType: true,
      displacement: true,
      brand: { select: { id: true, name: true, countryOrigin: true } },
      category: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /**
   * Vehículos de la flota. Los dados de baja se excluyen salvo que se pidan:
   * siguen existiendo (con todo su historial) pero ya no forman parte de la
   * flota que se inspecciona.
   *
   * Con `responsableId`, solo los vehículos de los que esa cuenta es
   * responsable (`GET /vehicles?mine=true`).
   */
  async findAll(includeInactive = false, responsableId?: string, inspectorId?: string) {
    let filtroInspector: Record<string, any> = {};
    if (inspectorId && !responsableId) {
      const inspector = await this.prisma.user?.findUnique({
        where: { id: inspectorId },
        select: { unitId: true },
      });
      if (inspector?.unitId) {
        filtroInspector = { unitId: inspector.unitId };
      } else {
        filtroInspector = { responsibleId: inspectorId };
      }
    }

    return this.prisma.vehicle.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(responsableId ? { responsibleId: responsableId } : {}),
        ...filtroInspector,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        ...RELACIONES_VEHICULO,
        scans: {
          orderBy: { scannedAt: 'desc' },
          take: 1,
          include: {
            dtcEntries: true,
            diagnosis: true,
          },
        },
        _count: {
          select: {
            scans: true,
            workOrders: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        ...RELACIONES_VEHICULO,
        scans: {
          orderBy: { scannedAt: 'desc' },
          include: {
            dtcEntries: true,
            diagnosis: true,
            scannedBy: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        workOrders: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignedTo: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehículo con ID ${id} no encontrado`);
    }

    return vehicle;
  }

  async findByVin(vin: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { vin: vin.trim().toUpperCase() },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehículo con VIN ${vin} no encontrado`);
    }

    return vehicle;
  }

  async findVehicleScans(id: string) {
    await this.findOne(id);
    return this.prisma.scan.findMany({
      where: { vehicleId: id },
      orderBy: { scannedAt: 'desc' },
      include: {
        dtcEntries: true,
        diagnosis: true,
        workOrder: true,
        scannedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async create(dto: CreateVehicleDto) {
    const plate = dto.plate.trim().toUpperCase();
    const vin = dto.vin?.trim() ? dto.vin.trim().toUpperCase() : null;

    const existingPlate = await this.prisma.vehicle.findUnique({ where: { plate } });
    if (existingPlate) {
      throw new ConflictException(`Ya existe un vehículo registrado con la placa ${plate}`);
    }

    if (vin) {
      const existingVin = await this.prisma.vehicle.findUnique({ where: { vin } });
      if (existingVin) {
        throw new ConflictException(`Ya existe un vehículo registrado con el VIN ${vin}`);
      }
    }

    let responsibleId = dto.responsibleId ?? null;
    if (!responsibleId && dto.unitId && (this.prisma as any).user?.findFirst) {
      const inspUnidad = await (this.prisma as any).user.findFirst({
        where: { unitId: dto.unitId, role: UserRole.INSPECTOR, active: true },
        select: { id: true },
      });
      if (inspUnidad) responsibleId = inspUnidad.id;
    } else if (responsibleId) {
      await this.validarResponsable(responsibleId);
    }

    let make = dto.make?.trim() || null;
    let model = dto.model?.trim() || null;
    let categoryId = dto.categoryId ?? null;

    if (dto.modelId && (this.prisma as any).vehicleModel) {
      const m = await (this.prisma as any).vehicleModel.findUnique({
        where: { id: dto.modelId },
        include: { brand: true },
      });
      if (m) {
        make = make || m.brand?.name || null;
        model = model || m.name || null;
        categoryId = categoryId || m.categoryId || null;
      }
    }

    const created = await this.prisma.vehicle.create({
      data: {
        plate,
        vin,
        alias: dto.alias?.trim() || null,
        make,
        model,
        year: dto.year ?? null,
        status: dto.status,
        responsibleId,
        ...(dto.modelId !== undefined ? { modelId: dto.modelId || null } : {}),
        ...(categoryId !== null || dto.categoryId !== undefined ? { categoryId } : {}),
        ...(dto.unitId !== undefined ? { unitId: dto.unitId || null } : {}),
      },
      include: RELACIONES_VEHICULO,
    });

    void this.auditService?.record({
      action: 'CREATE',
      entity: 'VEHICLE',
      entityId: created.id,
      summary: `Vehículo registrado: ${created.plate} (${[created.make, created.model].filter(Boolean).join(' ') || 'Sin marca'})`,
    });

    return created;
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);

    const data: Record<string, any> = { ...dto };
    if (dto.plate) data.plate = dto.plate.trim().toUpperCase();
    if (dto.vin !== undefined) {
      data.vin = dto.vin?.trim() ? dto.vin.trim().toUpperCase() : null;
    }

    // `null` quita el responsable; ausente, no se toca.
    if (dto.responsibleId !== undefined) {
      data.responsibleId = dto.responsibleId || null;
      if (data.responsibleId) {
        await this.validarResponsable(data.responsibleId);
      }
    }

    if (dto.modelId !== undefined) {
      data.modelId = dto.modelId || null;
      if (data.modelId && (this.prisma as any).vehicleModel) {
        const m = await (this.prisma as any).vehicleModel.findUnique({
          where: { id: data.modelId },
          include: { brand: true },
        });
        if (m) {
          if (!data.make) data.make = m.brand?.name || undefined;
          if (!data.model) data.model = m.name || undefined;
          if (dto.categoryId === undefined && m.categoryId) {
            data.categoryId = m.categoryId;
          }
        }
      }
    }

    if (dto.categoryId !== undefined) {
      data.categoryId = dto.categoryId || null;
    }
    if (dto.unitId !== undefined) {
      data.unitId = dto.unitId || null;
      if (dto.responsibleId === undefined && (this.prisma as any).user?.findFirst) {
        if (data.unitId) {
          const inspUnidad = await (this.prisma as any).user.findFirst({
            where: { unitId: data.unitId, role: UserRole.INSPECTOR, active: true },
            select: { id: true },
          });
          data.responsibleId = inspUnidad?.id ?? null;
        } else {
          data.responsibleId = null;
        }
      }
    }

    // Sin esta comprobación, repetir una placa o un VIN terminaba en un error
    // 500 de la base en lugar de un mensaje que el administrador entienda.
    if (data.plate) {
      const otro = await this.prisma.vehicle.findUnique({ where: { plate: data.plate } });
      if (otro && otro.id !== id) {
        throw new ConflictException(
          `Ya existe un vehículo registrado con la placa ${data.plate}`,
        );
      }
    }
    if (data.vin) {
      const otro = await this.prisma.vehicle.findUnique({ where: { vin: data.vin } });
      if (otro && otro.id !== id) {
        throw new ConflictException(
          `Ya existe un vehículo registrado con el VIN ${data.vin}`,
        );
      }
    }

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data,
      include: RELACIONES_VEHICULO,
    });

    void this.auditService?.record({
      action: 'UPDATE',
      entity: 'VEHICLE',
      entityId: updated.id,
      summary: `Vehículo editado: ${updated.plate}`,
    });

    return updated;
  }

  /**
   * Da de baja un vehículo SIN borrarlo.
   *
   * Antes era un `DELETE`, y por las claves foráneas en cascada se llevaba
   * todos los escaneos, hipótesis y órdenes del vehículo: justo el historial
   * que un sistema de mantenimiento existe para conservar. La baja lógica lo
   * saca de la flota activa y deja intacto lo demás.
   */
  async remove(id: string) {
    await this.findOne(id);

    const abiertas = await this.prisma.workOrder.count({
      where: {
        vehicleId: id,
        status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] },
      },
    });
    if (abiertas > 0) {
      throw new ConflictException(
        'El vehículo tiene órdenes de trabajo abiertas. Ciérrelas antes de darlo de baja.',
      );
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: { active: false },
    });
  }

  async reactivate(id: string) {
    await this.findOne(id);
    return this.prisma.vehicle.update({
      where: { id },
      data: { active: true },
    });
  }

  /**
   * El responsable de un vehículo es un inspector con la cuenta activa: es
   * quien recibe el aviso cuando su vehículo necesita revisión.
   */
  private async validarResponsable(userId: string): Promise<void> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, active: true },
    });

    if (!usuario) {
      throw new BadRequestException('El responsable indicado no existe.');
    }
    if (!usuario.active) {
      throw new BadRequestException('El responsable indicado tiene la cuenta desactivada.');
    }
    if (usuario.role !== UserRole.INSPECTOR) {
      throw new BadRequestException(
        'El responsable de un vehículo debe ser un usuario con rol de inspector.',
      );
    }
  }
}
