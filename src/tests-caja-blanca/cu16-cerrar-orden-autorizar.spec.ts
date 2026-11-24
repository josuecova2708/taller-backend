// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU16. Cerrar Orden y Autorizar Operación del Vehículo
// Método evaluado: WorkOrdersService.close(id, status, resolution, actor)
// Complejidad Ciclomática V(G) = 5 + 1 = 6 caminos independientes
// ============================================================================

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Optional: () => () => {},
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../obd/vehicle-status.service', () => ({ VehicleStatusService: class {} }));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  UserRole,
  VehicleStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';
import { WorkOrdersService } from '../work-orders/work-orders.service';

describe('9.3.2. Pruebas de caja blanca — CU16. Cerrar Orden y Autorizar Operación del Vehículo', () => {
  const ordenBase = {
    id: 'wo-tacoma-001',
    vehicleId: 'veh-tacoma-5521',
    assignedToId: 'mec-001',
    status: WorkOrderStatus.IN_PROGRESS,
    priority: WorkOrderPriority.CRITICAL,
    notes: 'Revisión de cilindro 1.',
  };

  function crearContexto(orden: any = ordenBase, otrasAbiertas = 0) {
    const prismaMock = {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(orden),
        count: jest.fn().mockResolvedValue(otrasAbiertas),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, ...orden, ...data }),
        ),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mec-001',
          name: 'Roberto Mecánico',
          role: UserRole.MECHANIC,
          active: true,
        }),
      },
      vehicle: {
        update: jest.fn().mockResolvedValue({
          id: 'veh-tacoma-5521',
          status: VehicleStatus.OK,
        }),
      },
    };
    const vehicleStatusMock = {
      recomputeForVehicle: jest.fn().mockResolvedValue(VehicleStatus.CRITICAL),
    };
    const service = new WorkOrdersService(prismaMock as any, vehicleStatusMock as any);
    return { service, prismaMock, vehicleStatusMock };
  }

  it('Camino 1 (1,2,3,13): lanza ConflictException cuando la orden ya se encuentra cerrada (!ESTADOS_ABIERTOS)', async () => {
    const { service } = crearContexto({ ...ordenBase, status: WorkOrderStatus.COMPLETED });

    await expect(
      service.close('wo-tacoma-001', WorkOrderStatus.COMPLETED, 'Listo', {
        sub: 'mec-001',
        role: UserRole.MECHANIC,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('Camino 2 (1,2,4,5,13): lanza ForbiddenException cuando el actor no administra órdenes y no es el mecánico asignado', async () => {
    const { service } = crearContexto(ordenBase);

    await expect(
      service.close('wo-tacoma-001', WorkOrderStatus.COMPLETED, 'Listo', {
        sub: 'mec-otro-999',
        role: UserRole.MECHANIC,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Camino 3 (1,2,4,6,7,13): lanza BadRequestException cuando la nota de resolución está vacía (!justificacion)', async () => {
    const { service } = crearContexto(ordenBase);

    await expect(
      service.close('wo-tacoma-001', WorkOrderStatus.COMPLETED, '   ', {
        sub: 'mec-001',
        role: UserRole.MECHANIC,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('Camino 4 (1,2,4,6,8,9,12,13): autoriza la operación y cambia el vehículo a OK cuando status=COMPLETED y otrasAbiertas === 0 (habilita = true)', async () => {
    const { service, prismaMock } = crearContexto(ordenBase, 0);

    const resultado = await service.close(
      'wo-tacoma-001',
      WorkOrderStatus.COMPLETED,
      'Bobina y bujía del cilindro 1 reemplazadas.',
      { sub: 'mec-001', role: UserRole.MECHANIC },
    );

    expect(resultado.operationAuthorized).toBe(true);
    expect(resultado.vehicleStatus).toBe(VehicleStatus.OK);
    expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'veh-tacoma-5521' },
      data: { status: VehicleStatus.OK },
    });
  });

  it('Camino 5 (1,2,4,6,8,10,12,13): cierra como COMPLETED pero mantiene operationAuthorized=false y vehicleStatus=null cuando existen otras órdenes abiertas', async () => {
    const { service, prismaMock } = crearContexto(ordenBase, 1);

    const resultado = await service.close(
      'wo-tacoma-001',
      WorkOrderStatus.COMPLETED,
      'Se reparó cilindro 1, queda otra orden pendiente.',
      { sub: 'mec-001', role: UserRole.MECHANIC },
    );

    expect(resultado.operationAuthorized).toBe(false);
    expect(resultado.vehicleStatus).toBeNull();
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });

  it('Camino 6 (1,2,4,6,8,10,11,12,13): cierra como CANCELLED sin autorizar operación y recalcula el estado desde el último escaneo', async () => {
    const { service, vehicleStatusMock, prismaMock } = crearContexto(ordenBase, 0);

    const resultado = await service.close(
      'wo-tacoma-001',
      WorkOrderStatus.CANCELLED,
      'Orden cancelada por duplicidad.',
      { sub: 'admin-001', role: UserRole.ADMIN },
    );

    expect(resultado.operationAuthorized).toBe(false);
    expect(resultado.vehicleStatus).toBe(VehicleStatus.CRITICAL);
    expect(vehicleStatusMock.recomputeForVehicle).toHaveBeenCalledWith('veh-tacoma-5521');
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });
});
