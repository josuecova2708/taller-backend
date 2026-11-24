// ============================================================================
// 9.3.1. Pruebas de caja negra — CU16. Cerrar Orden y Autorizar Operación del Vehículo
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
  UserRole,
  VehicleStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';
import { WorkOrdersService } from '../work-orders/work-orders.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU16. Cerrar Orden y Autorizar Operación del Vehículo', () => {
    it('Prueba de CU16 Cerrar Orden y Autorizar Operación del Vehículo', async () => {
      // Precondición: La orden está en estado IN_PROGRESS asignada al mecánico
      // y el vehículo figura en estado CRITICAL (Requiere evaluación).
      const ordenEnProceso = {
        id: 'wo-tacoma-001',
        vehicleId: 'veh-tacoma-5521',
        assignedToId: 'mec-001',
        status: WorkOrderStatus.IN_PROGRESS,
        priority: WorkOrderPriority.CRITICAL,
        notes: '[2026-11-22] Roberto Mecánico: Se aisló fallo en bobina del cilindro 1.',
      };

      const prismaMock = {
        workOrder: {
          findUnique: jest.fn().mockResolvedValue(ordenEnProceso),
          count: jest.fn().mockResolvedValue(0),
          update: jest.fn().mockImplementation(({ where, data }) =>
            Promise.resolve({ id: where.id, ...ordenEnProceso, ...data }),
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

      const workOrdersService = new WorkOrdersService(prismaMock as any, {} as any);

      // Entrada: Resultado COMPLETED y justificación técnica de la reparación
      const resolucion =
        'Se reemplazó la bobina de encendido y bujía del cilindro 1. Motor opera sin fallos.';

      // Condición de ejecución: Cierre de la orden vía POST /api/work-orders/:id/close
      const resultado = await workOrdersService.close(
        'wo-tacoma-001',
        WorkOrderStatus.COMPLETED,
        resolucion,
        { sub: 'mec-001', role: UserRole.MECHANIC },
      );

      // Resultado Esperado / Obtenido
      expect(resultado.orden.status).toBe(WorkOrderStatus.COMPLETED);
      expect(resultado.operationAuthorized).toBe(true);
      expect(resultado.vehicleStatus).toBe(VehicleStatus.OK);
      expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'veh-tacoma-5521' },
        data: { status: VehicleStatus.OK },
      });
    });
  });
});
