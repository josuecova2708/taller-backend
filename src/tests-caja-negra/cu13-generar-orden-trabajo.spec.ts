// ============================================================================
// 9.3.1. Pruebas de caja negra — CU13. Generar Orden de Trabajo
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

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU13. Generar Orden de Trabajo', () => {
    it('Prueba de CU13 Generar Orden de Trabajo', async () => {
      // Precondición: Se registró un escaneo con severidad CRITICAL y el vehículo
      // no posee otra orden abierta.
      const prismaMock = {
        workOrder: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: 'wo-nueva-001', ...data }),
          ),
        },
      };

      const workOrdersService = new WorkOrdersService(prismaMock as any, {} as any);

      // Entrada: Datos del escaneo que requiere evaluación en taller
      const entrada = {
        vehicleId: 'veh-tacoma-5521',
        scanId: 'scan-001',
        severity: ScanSeverity.CRITICAL,
        rationale: 'Fallo de encendido confirmado y recurrente en cilindro 1.',
        codes: ['P0300', 'P0301'],
      };

      // Condición de ejecución: Generación de la orden de trabajo
      const { orden, creada } = await workOrdersService.createOrUpdateForScan(entrada);

      // Resultado Esperado / Obtenido
      expect(creada).toBe(true);
      expect(orden.id).toBe('wo-nueva-001');
      expect(orden.status).toBe(WorkOrderStatus.OPEN);
      expect(orden.priority).toBe(WorkOrderPriority.CRITICAL);
      expect(orden.description).toContain('P0300, P0301');
    });
  });
});
