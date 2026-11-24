// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU07. Enviar Escaneo al Servidor
// Método evaluado: ScansService.create(dto: CreateScanDto, userId: string)
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

import { BadRequestException } from '@nestjs/common';
import { DtcType, ScanSeverity, VehicleStatus } from '@prisma/client';
import { DeterministicFilterService } from '../obd/deterministic-filter.service';
import { ScansService } from '../scans/scans.service';

describe('9.3.2. Pruebas de caja blanca — CU07. Enviar Escaneo al Servidor', () => {
  const vehiculoMock = {
    id: 'veh-tacoma-5521',
    plate: '5521-TAC',
    vin: '5TFCZ5AN3MX255216',
    active: true,
    status: VehicleStatus.OK,
  };

  function construirContexto(vehiculo: any = vehiculoMock, creada = true) {
    const prismaMock = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(vehiculo),
        update: jest.fn().mockResolvedValue(vehiculo),
      },
      scan: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'scan-001',
            ...data,
            vehicle: vehiculo,
            dtcEntries: data.dtcEntries?.create ?? [],
          }),
        ),
      },
      workOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const filterService = new DeterministicFilterService();
    const diagnosisMock = { processScan: jest.fn().mockResolvedValue(undefined) };
    const workOrdersMock = {
      createOrUpdateForScan: jest.fn().mockResolvedValue({
        orden: { id: 'wo-001' },
        creada,
      }),
      countOpenByVehicle: jest.fn().mockResolvedValue(creada ? 1 : 0),
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

    return { scansService, prismaMock, diagnosisMock, workOrdersMock, n8nMock, pushMock };
  }

  it('Camino 1 (1,2,3,12): lanza BadRequestException cuando dto.complete === false (escaneo incompleto)', async () => {
    const { scansService, prismaMock } = construirContexto();

    await expect(
      scansService.create({ vehicleId: 'veh-tacoma-5521', complete: false, dtcs: [] } as any, 'insp-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.scan.create).not.toHaveBeenCalled();
  });

  it('Camino 2 (1,2,4,5,12): lanza BadRequestException cuando el vehículo no existe, está inactivo o tiene VIN en conflicto', async () => {
    const { scansService, prismaMock } = construirContexto(null);

    await expect(
      scansService.create({ vehicleId: 'inexistente', complete: true, dtcs: [] } as any, 'insp-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.scan.create).not.toHaveBeenCalled();
  });

  it('Camino 3 (1,2,4,6,7,11,12): persiste el escaneo limpio sin crear orden, sin alertas y sin invocar IA (requiresAiEvaluation = false)', async () => {
    const { scansService, workOrdersMock, n8nMock, diagnosisMock } = construirContexto(vehiculoMock, false);

    const res = await scansService.create(
      {
        vehicleId: 'veh-tacoma-5521',
        complete: true,
        readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
        dtcs: [],
      } as any,
      'insp-1',
    );

    expect(res.evaluation.severity).toBe(ScanSeverity.NONE);
    expect(workOrdersMock.createOrUpdateForScan).not.toHaveBeenCalled();
    expect(n8nMock.notificarAlerta).not.toHaveBeenCalled();
    expect(diagnosisMock.processScan).not.toHaveBeenCalled();
    expect(res.workOrderId).toBeNull();
  });

  it('Camino 4 (1,2,4,6,7,8,9,11,12): actualiza la orden existente sin reenviar alertas por n8n/push y solicita IA (creada = false)', async () => {
    const { scansService, workOrdersMock, n8nMock, pushMock, diagnosisMock } = construirContexto(
      vehiculoMock,
      false,
    );

    const res = await scansService.create(
      {
        vehicleId: 'veh-tacoma-5521',
        complete: true,
        dtcs: [{ code: 'P0300', type: DtcType.CONFIRMED }],
      } as any,
      'insp-1',
    );

    expect(workOrdersMock.createOrUpdateForScan).toHaveBeenCalledTimes(1);
    expect(n8nMock.notificarAlerta).not.toHaveBeenCalled();
    expect(pushMock.notificarOrden).not.toHaveBeenCalled();
    expect(diagnosisMock.processScan).toHaveBeenCalledWith('scan-001');
    expect(res.workOrderId).toBeNull();
  });

  it('Camino 5 (1,2,4,6,7,8,9,10,11,12): crea nueva orden de trabajo, despacha alertas n8n/push e invoca IA (creada = true)', async () => {
    const { scansService, workOrdersMock, n8nMock, pushMock, diagnosisMock } = construirContexto(
      vehiculoMock,
      true,
    );

    const res = await scansService.create(
      {
        vehicleId: 'veh-tacoma-5521',
        complete: true,
        dtcs: [
          { code: 'P0300', type: DtcType.CONFIRMED },
          { code: 'P0301', type: DtcType.CONFIRMED },
        ],
      } as any,
      'insp-1',
    );

    expect(workOrdersMock.createOrUpdateForScan).toHaveBeenCalledTimes(1);
    expect(n8nMock.notificarAlerta).toHaveBeenCalledWith('wo-001');
    expect(pushMock.notificarOrden).toHaveBeenCalledWith('wo-001');
    expect(diagnosisMock.processScan).toHaveBeenCalledWith('scan-001');
    expect(res.workOrderId).toBe('wo-001');
  });
});
