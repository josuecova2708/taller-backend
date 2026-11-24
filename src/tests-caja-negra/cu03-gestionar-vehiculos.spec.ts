// ============================================================================
// 9.3.1. Pruebas de caja negra — CU03. Gestionar Vehículos
// ============================================================================

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Optional: () => () => {},
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { UserRole, VehicleStatus } from '@prisma/client';
import { VehiclesService } from '../vehicles/vehicles.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU03. Gestionar Vehículos', () => {
    it('Prueba de CU03 Gestionar Vehículos', async () => {
      // Precondición: El administrador tiene sesión activa y la unidad organizacional
      // FICCT-UAGRM cuenta con un inspector asignado.
      const prismaMock = {
        vehicle: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({
              id: 'veh-nuevo-001',
              active: true,
              ...data,
              status: data.status ?? VehicleStatus.OK,
            }),
          ),
        },
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'insp-ficct-001',
            role: UserRole.INSPECTOR,
            active: true,
          }),
        },
      };

      const vehiclesService = new VehiclesService(prismaMock as any);

      // Entrada: Datos del nuevo vehículo asignado a la unidad FICCT-UAGRM
      const nuevoVehiculo = {
        plate: '5033-ICC',
        vin: 'JS3TD04V8C5033118',
        make: 'Suzuki',
        model: 'Grand Vitara',
        year: 2021,
        alias: 'Vagoneta Soporte de Redes FICCT',
        unitId: 'unit-ficct-uagrm',
      };

      // Condición de ejecución: Registro del vehículo vía POST /api/vehicles
      const creado = await vehiclesService.create(nuevoVehiculo);

      // Resultado Esperado / Obtenido
      expect(creado.plate).toBe('5033-ICC');
      expect(creado.vin).toBe('JS3TD04V8C5033118');
      expect(creado.unitId).toBe('unit-ficct-uagrm');
      expect(creado.responsibleId).toBe('insp-ficct-001');
      expect(creado.status).toBe(VehicleStatus.OK);
    });
  });
});
