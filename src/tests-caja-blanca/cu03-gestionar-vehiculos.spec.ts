// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU03. Gestionar Vehículos
// Método evaluado: VehiclesService.create(dto: CreateVehicleDto)
// Complejidad Ciclomática V(G) = 4 + 1 = 5 caminos independientes
// ============================================================================

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Optional: () => () => {},
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { ConflictException } from '@nestjs/common';
import { UserRole, VehicleStatus } from '@prisma/client';
import { VehiclesService } from '../vehicles/vehicles.service';

describe('9.3.2. Pruebas de caja blanca — CU03. Gestionar Vehículos', () => {
  it('Camino 1 (1,2,3,10): lanza ConflictException cuando la placa ya está registrada (existingPlate)', async () => {
    const prismaMock = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValueOnce({ id: 'veh-existente', plate: '5033-ICC' }),
        create: jest.fn(),
      },
    };
    const service = new VehiclesService(prismaMock as any);

    await expect(
      service.create({ plate: '5033-ICC', vin: 'JS3TD04V8C5033118' }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });

  it('Camino 2 (1,2,4,5,10): lanza ConflictException cuando el VIN ya pertenece a otro vehículo (existingVin)', async () => {
    const prismaMock = {
      vehicle: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // placa libre
          .mockResolvedValueOnce({ id: 'veh-otro', vin: 'JS3TD04V8C5033118' }), // VIN duplicado
        create: jest.fn(),
      },
    };
    const service = new VehiclesService(prismaMock as any);

    await expect(
      service.create({ plate: '5033-ICC', vin: 'JS3TD04V8C5033118' }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });

  it('Camino 3 (1,2,4,6,7,9,10): auto-asigna el inspector activo de la unidad cuando se envía unitId sin responsibleId', async () => {
    const prismaMock = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'veh-nuevo-001', active: true, status: VehicleStatus.OK, ...data }),
        ),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'insp-ficct-001' }),
      },
    };
    const service = new VehiclesService(prismaMock as any);

    const creado = await service.create({
      plate: '5033-ICC',
      vin: 'JS3TD04V8C5033118',
      unitId: 'unit-ficct-uagrm',
    });

    expect(prismaMock.user.findFirst).toHaveBeenCalledTimes(1);
    expect(creado.responsibleId).toBe('insp-ficct-001');
  });

  it('Camino 4 (1,2,4,6,8,9,10): valida el responsable explícito mediante validarResponsable cuando se envía responsibleId', async () => {
    const prismaMock = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'veh-nuevo-002', active: true, status: VehicleStatus.OK, ...data }),
        ),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'insp-exp-001',
          role: UserRole.INSPECTOR,
          active: true,
        }),
      },
    };
    const service = new VehiclesService(prismaMock as any);

    const creado = await service.create({
      plate: '5034-ICC',
      vin: 'JS3TD04V8C5033119',
      responsibleId: 'insp-exp-001',
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'insp-exp-001' },
      select: { id: true, role: true, active: true },
    });
    expect(creado.responsibleId).toBe('insp-exp-001');
  });

  it('Camino 5 (1,2,4,6,9,10): registra el vehículo con responsibleId = null cuando no se envía unitId ni responsibleId', async () => {
    const prismaMock = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'veh-nuevo-003', active: true, status: VehicleStatus.OK, ...data }),
        ),
      },
      user: { findFirst: jest.fn(), findUnique: jest.fn() },
    };
    const service = new VehiclesService(prismaMock as any);

    const creado = await service.create({ plate: '5035-ICC' });

    expect(creado.responsibleId).toBeNull();
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
