// ============================================================================
// 9.3.1. Pruebas de caja negra — CU07. Enviar Escaneo al Servidor (Registrar Escaneo)
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
  UnauthorizedException: class UnauthorizedException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../obd/vehicle-status.service', () => ({ VehicleStatusService: class {} }));
jest.mock('../audit/audit.service', () => ({ AuditService: class {} }));
jest.mock('../diagnosis/diagnosis.service', () => ({
  DiagnosisService: class {},
  VENTANA_HISTORIAL: 3,
}));
jest.mock('../n8n/n8n.service', () => ({ N8nService: class {} }));
jest.mock('../push/push.service', () => ({ PushService: class {} }));

import { DtcType, ScanSeverity, VehicleStatus } from '@prisma/client';
import { DeterministicFilterService } from '../obd/deterministic-filter.service';
import { ScansService } from '../scans/scans.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU07. Enviar Escaneo al Servidor', () => {
    it('Prueba de CU07 Enviar Escaneo al Servidor', async () => {
      // Precondición: El inspector realizó el escaneo OBD-II sobre el vehículo 5521-TAC
      // y cuenta con sesión activa para transmitir el payload JSON al servidor.
      const vehiculo = {
        id: 'veh-tacoma-5521',
        plate: '5521-TAC',
        vin: '5TFCZ5AN3MX255216',
        active: true,
        status: VehicleStatus.OK,
      };

      const prismaMock = {
        vehicle: {
          findUnique: jest.fn().mockResolvedValue(vehiculo),
          update: jest.fn().mockResolvedValue({
            ...vehiculo,
            status: VehicleStatus.CRITICAL,
          }),
        },
        scan: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({
              id: 'scan-registrado-001',
              ...data,
              vehicle: vehiculo,
              dtcEntries: [
                { id: 'dtc-1', code: 'P0300', type: DtcType.CONFIRMED },
                { id: 'dtc-2', code: 'P0301', type: DtcType.CONFIRMED },
              ],
            }),
          ),
        },
        workOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      const filterService = new DeterministicFilterService();
      const diagnosisMock = { processScan: jest.fn().mockResolvedValue(undefined) };
      const workOrdersMock = {
        createOrUpdateForScan: jest.fn().mockResolvedValue({
          orden: { id: 'wo-generada-001' },
          creada: true,
        }),
        countOpenByVehicle: jest.fn().mockResolvedValue(1),
      };
      const n8nMock = { notificarAlerta: jest.fn().mockResolvedValue(undefined) };
      const pushMock = { notificarOrden: jest.fn().mockResolvedValue(undefined) };

      const scansService = new ScansService(
        prismaMock as any,
        filterService,
        diagnosisMock as any,
        workOrdersMock as any,
        n8nMock as any,
        pushMock as any,
      );

      // Entrada: Payload JSON del escaneo enviado a POST /api/scans
      const payloadEscaneo = {
        vehicleId: 'veh-tacoma-5521',
        vin: '5TFCZ5AN3MX255216',
        batteryVoltage: 13.3,
        complete: true,
        readinessStatus: {
          milOn: true,
          dtcCount: 2,
          monitorsCompleted: true,
          incompleteMonitors: [],
        },
        dtcs: [
          { code: 'P0300', type: DtcType.CONFIRMED },
          { code: 'P0301', type: DtcType.CONFIRMED },
        ],
        notes: 'Inspección previa a viaje de prácticas.',
      };

      // Condición de ejecución: Envío y registro del escaneo en el servidor
      const respuesta = await scansService.create(
        payloadEscaneo as any,
        'inspector-fca-001',
      );

      // Resultado Esperado / Obtenido: Escaneo persistido en BD y estado actualizado
      expect(prismaMock.scan.create).toHaveBeenCalledTimes(1);
      expect(respuesta.scan.id).toBe('scan-registrado-001');
      expect(respuesta.scan.dtcEntries).toHaveLength(2);
      expect(respuesta.evaluation.severity).toBe(ScanSeverity.CRITICAL);
      expect(respuesta.scan.vehicle.status).toBe(VehicleStatus.CRITICAL);
      expect(respuesta.workOrderId).toBe('wo-generada-001');
    });
  });
});
