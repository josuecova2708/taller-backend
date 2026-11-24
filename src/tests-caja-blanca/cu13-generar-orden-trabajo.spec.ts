// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU13. Generar Orden de Trabajo
// Método evaluado: WorkOrdersService.createOrUpdateForScan(entrada: EntradaOrden)
// Complejidad Ciclomática V(G) = 2 + 1 = 3 caminos independientes
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

import { ScanSeverity, WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import { WorkOrdersService } from '../work-orders/work-orders.service';

describe('9.3.2. Pruebas de caja blanca — CU13. Generar Orden de Trabajo', () => {
  const entradaBase = {
    vehicleId: 'veh-tacoma-5521',
    scanId: 'scan-001',
    severity: ScanSeverity.CRITICAL,
    rationale: 'Fallo de encendido confirmado y recurrente en cilindro 1.',
    codes: ['P0300', 'P0301'],
  };

  it('Camino 1 (1,2,3,4,6): actualiza la orden existente con códigos y sube prioridad cuando existente != null y codes.length > 0', async () => {
    const prismaMock = {
      workOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wo-existente-001',
            priority: WorkOrderPriority.MEDIUM,
            status: WorkOrderStatus.OPEN,
            notes: 'Orden previa en revisión.',
          },
        ]),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, status: WorkOrderStatus.OPEN, ...data }),
        ),
        create: jest.fn(),
      },
    };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    const { orden, creada } = await service.createOrUpdateForScan(entradaBase);

    expect(creada).toBe(false);
    expect(prismaMock.workOrder.create).not.toHaveBeenCalled();
    expect(orden.priority).toBe(WorkOrderPriority.CRITICAL);
    expect(orden.notes).toContain('P0300, P0301');
  });

  it('Camino 2 (1,2,3,5,6): actualiza la orden existente con etiqueta "sin códigos" cuando existente != null y codes.length === 0', async () => {
    const prismaMock = {
      workOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wo-existente-002',
            priority: WorkOrderPriority.HIGH,
            status: WorkOrderStatus.IN_PROGRESS,
            notes: null,
          },
        ]),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, status: WorkOrderStatus.IN_PROGRESS, ...data }),
        ),
        create: jest.fn(),
      },
    };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    const { orden, creada } = await service.createOrUpdateForScan({
      ...entradaBase,
      severity: ScanSeverity.MEDIUM,
      codes: [],
    });

    expect(creada).toBe(false);
    expect(orden.priority).toBe(WorkOrderPriority.HIGH);
    expect(orden.notes).toContain('sin códigos');
  });

  it('Camino 3 (1,2,7,6): crea una nueva orden de trabajo en estado OPEN cuando el vehículo no tiene orden abierta (existente == null)', async () => {
    const prismaMock = {
      workOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'wo-nueva-001', ...data }),
        ),
        update: jest.fn(),
      },
    };
    const service = new WorkOrdersService(prismaMock as any, {} as any);

    const { orden, creada } = await service.createOrUpdateForScan(entradaBase);

    expect(creada).toBe(true);
    expect(prismaMock.workOrder.create).toHaveBeenCalledTimes(1);
    expect(orden.id).toBe('wo-nueva-001');
    expect(orden.status).toBe(WorkOrderStatus.OPEN);
    expect(orden.priority).toBe(WorkOrderPriority.CRITICAL);
  });
});
