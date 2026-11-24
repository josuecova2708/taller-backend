// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU14. Gestionar Órdenes de Trabajo
// Método evaluado: WorkOrdersService.take(id: string, actor: Actor)
// Complejidad Ciclomática V(G) = 4 + 1 = 5 caminos independientes
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

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole, WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import { WorkOrdersService } from '../work-orders/work-orders.service';

describe('9.3.2. Pruebas de caja blanca — CU14. Gestionar Órdenes de Trabajo', () => {
  const ordenBase = {
    id: 'wo-4829-nfp',
    vehicleId: 'veh-frontier-4829',
    assignedToId: null,
    assignedTo: null,
    status: WorkOrderStatus.OPEN,
    priority: WorkOrderPriority.HIGH,
    notes: null,
  };

  it('Camino 1 (1,2,3,11): lanza ForbiddenException cuando quien intenta tomar la orden no tiene rol MECHANIC', async () => {
    const prismaMock = { workOrder: { findUnique: jest.fn(), updateMany: jest.fn() } };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    await expect(
      service.take('wo-4829-nfp', { sub: 'admin-001', role: UserRole.ADMIN }),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.workOrder.updateMany).not.toHaveBeenCalled();
  });

  it('Camino 2 (1,2,4,5,6,11): lanza ConflictException cuando count === 0 porque la orden ya está cerrada (!ESTADOS_ABIERTOS)', async () => {
    const prismaMock = {
      workOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(ordenBase)
          .mockResolvedValueOnce({ ...ordenBase, status: WorkOrderStatus.COMPLETED }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Roberto Mecánico' }) },
    };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    await expect(
      service.take('wo-4829-nfp', { sub: 'mec-001', role: UserRole.MECHANIC }),
    ).rejects.toThrow(new ConflictException('La orden ya está cerrada (COMPLETED).'));
  });

  it('Camino 3 (1,2,4,5,7,8,11): lanza ConflictException cuando count === 0 porque otro mecánico ya tomó la orden (actual.assignedTo != null)', async () => {
    const prismaMock = {
      workOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(ordenBase)
          .mockResolvedValueOnce({
            ...ordenBase,
            status: WorkOrderStatus.IN_PROGRESS,
            assignedToId: 'mec-002',
            assignedTo: { id: 'mec-002', name: 'Pedro Mecánico' },
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Roberto Mecánico' }) },
    };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    await expect(
      service.take('wo-4829-nfp', { sub: 'mec-001', role: UserRole.MECHANIC }),
    ).rejects.toThrow(new ConflictException('Esta orden ya fue tomada por Pedro Mecánico.'));
  });

  it('Camino 4 (1,2,4,5,7,9,11): lanza ConflictException cuando count === 0 porque la orden ya está en proceso sin responsable asignado', async () => {
    const prismaMock = {
      workOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(ordenBase)
          .mockResolvedValueOnce({
            ...ordenBase,
            status: WorkOrderStatus.IN_PROGRESS,
            assignedTo: null,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Roberto Mecánico' }) },
    };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    await expect(
      service.take('wo-4829-nfp', { sub: 'mec-001', role: UserRole.MECHANIC }),
    ).rejects.toThrow(
      new ConflictException('Esta orden ya está en proceso y no puede tomarse.'),
    );
  });

  it('Camino 5 (1,2,4,10,11): asigna la orden al mecánico, pasa a IN_PROGRESS y registra historial cuando count === 1', async () => {
    const prismaMock = {
      workOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(ordenBase)
          .mockResolvedValueOnce({
            ...ordenBase,
            assignedToId: 'mec-001',
            status: WorkOrderStatus.IN_PROGRESS,
            notes: '[2026-11-23] Roberto Mecánico tomó la orden.',
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Roberto Mecánico' }) },
    };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    const ordenTomada = await service.take('wo-4829-nfp', {
      sub: 'mec-001',
      role: UserRole.MECHANIC,
    });

    expect(ordenTomada.assignedToId).toBe('mec-001');
    expect(ordenTomada.status).toBe(WorkOrderStatus.IN_PROGRESS);
    expect(ordenTomada.notes).toContain('Roberto Mecánico tomó la orden');
  });
});
