import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
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

    return this.prisma.vehicle.create({
      data: {
        plate,
        vin,
        alias: dto.alias?.trim() || null,
        make: dto.make?.trim() || null,
        model: dto.model?.trim() || null,
        year: dto.year ?? null,
        status: dto.status,
      },
    });
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);

    const data: Record<string, any> = { ...dto };
    if (dto.plate) data.plate = dto.plate.trim().toUpperCase();
    if (dto.vin !== undefined) {
      data.vin = dto.vin?.trim() ? dto.vin.trim().toUpperCase() : null;
    }

    return this.prisma.vehicle.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vehicle.delete({
      where: { id },
    });
  }
}
