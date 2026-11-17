import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UserRole, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

/** Lo que sale por la API del responsable de un vehículo. */
export const RESPONSABLE_PUBLICO = {
  select: { id: true, name: true, email: true },
} as const;

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vehículos de la flota. Los dados de baja se excluyen salvo que se pidan:
   * siguen existiendo (con todo su historial) pero ya no forman parte de la
   * flota que se inspecciona.
   *
   * Con `responsableId`, solo los vehículos de los que esa cuenta es
   * responsable (`GET /vehicles?mine=true`).
   */
  async findAll(includeInactive = false, responsableId?: string) {
    return this.prisma.vehicle.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(responsableId ? { responsibleId: responsableId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        responsible: RESPONSABLE_PUBLICO,
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
        responsible: RESPONSABLE_PUBLICO,
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

    const responsibleId = dto.responsibleId ?? null;
    if (responsibleId) {
      await this.validarResponsable(responsibleId);
    }

    return this.prisma.vehicle.create({
      data: {
        plate,
        vin,
        alias: dto.alias?.trim() || null,
        make: dto.make?.trim() || null,
        model: dto.model?.trim() || null,
        year: dto.year ?? null,
        status: dto.status,
        responsibleId,
      },
      include: { responsible: RESPONSABLE_PUBLICO },
    });
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

    return this.prisma.vehicle.update({
      where: { id },
      data,
      include: { responsible: RESPONSABLE_PUBLICO },
    });
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
