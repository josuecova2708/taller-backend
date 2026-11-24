// ============================================================================
// 9.3.1. Pruebas de caja negra — CU14. Gestionar Órdenes de Trabajo
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

import { UserRole, WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import { WorkOrdersService } from '../work-orders/work-orders.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU14. Gestionar Órdenes de Trabajo', () => {
    it('Prueba de CU14 Gestionar Órdenes de Trabajo', async () => {
      // Precondición: Existe una orden de trabajo en estado OPEN sin mecánico asignado.
      const ordenSinAsignar = {
        id: 'wo-4829-nfp',
        vehicleId: 'veh-frontier-4829',
        assignedToId: null,
        status: WorkOrderStatus.OPEN,
        priority: WorkOrderPriority.HIGH,
        notes: null,
      };

      const prismaMock = {
        workOrder: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(ordenSinAsignar)
            .mockResolvedValueOnce({
              ...ordenSinAsignar,
              assignedToId: 'mec-001',
              status: WorkOrderStatus.IN_PROGRESS,
              notes: '[2026-11-23] Roberto Mecánico tomó la orden.',
            }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'mec-001',
            name: 'Roberto Mecánico',
            role: UserRole.MECHANIC,
            active: true,
          }),
        },
      };

      const workOrdersService = new WorkOrdersService(prismaMock as any, {} as any);

      // Condición de ejecución: El mecánico toma la orden desde la bandeja general (POST /api/work-orders/:id/take)
      const ordenTomada = await workOrdersService.take('wo-4829-nfp', {
        sub: 'mec-001',
        role: UserRole.MECHANIC,
      });

      // Resultado Esperado / Obtenido
      expect(ordenTomada.assignedToId).toBe('mec-001');
      expect(ordenTomada.status).toBe(WorkOrderStatus.IN_PROGRESS);
      expect(ordenTomada.notes).toContain('Roberto Mecánico tomó la orden');
    });
  });
});
