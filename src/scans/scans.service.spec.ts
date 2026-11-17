// NestJS 12 es ESM-first y ts-jest corre en CommonJS: mismo workaround que
// work-orders.service.spec.ts. Los servicios colaboradores se stubean para no
// cargar Neon, Firebase ni el SDK de IA; las pruebas inyectan mocks.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  NotFoundException: class NotFoundException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
  ConflictException: class ConflictException extends Error {},
  UnauthorizedException: class UnauthorizedException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../obd/deterministic-filter.service', () => ({
  DeterministicFilterService: class {},
}));
jest.mock('../diagnosis/diagnosis.service', () => ({
  DiagnosisService: class {},
  VENTANA_HISTORIAL: 3,
}));
jest.mock('../work-orders/work-orders.service', () => ({
  WorkOrdersService: class {},
}));
jest.mock('../n8n/n8n.service', () => ({ N8nService: class {} }));
jest.mock('../push/push.service', () => ({ PushService: class {} }));

import { BadRequestException } from '@nestjs/common';
import { ScansService } from './scans.service';

describe('ScansService.create', () => {
  const USER_ID = 'user-1';
  const VEHICULO = {
    id: 'veh-1',
    plate: '1234ABC',
    vin: '5TFCZ5AN3MX255216',
    active: true,
    status: 'OPERATIVO',
  };
  const ESCANEO = {
    id: 'scan-1',
    vehicle: VEHICULO,
    dtcEntries: [{ code: 'P0300', type: 'STORED' }],
  };
  const DTO: any = {
    vehicleId: VEHICULO.id,
    dtcs: [{ code: 'p0300', type: 'STORED' }],
  };

  let prisma: any;
  let filterService: any;
  let diagnosisService: any;
  let workOrdersService: any;
  let n8nService: any;
  let pushService: any;
  let service: ScansService;

  const evaluacion = (requiresAiEvaluation: boolean) => ({
    requiresAiEvaluation,
    severity: requiresAiEvaluation ? 'ALTA' : 'BAJA',
    rationale: requiresAiEvaluation ? 'Falla de encendido' : 'Sin fallas',
    vehicleStatus: requiresAiEvaluation ? 'EN_OBSERVACION' : 'OPERATIVO',
  });

  beforeEach(() => {
    prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(VEHICULO),
        update: jest.fn().mockResolvedValue(VEHICULO),
      },
      scan: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(ESCANEO),
      },
    };
    filterService = { evaluateScan: jest.fn() };
    diagnosisService = { processScan: jest.fn().mockResolvedValue(undefined) };
    workOrdersService = {
      createOrUpdateForScan: jest.fn(),
      countOpenByVehicle: jest.fn().mockResolvedValue(0),
    };
    n8nService = { notificarAlerta: jest.fn().mockResolvedValue(undefined) };
    pushService = { notificarOrden: jest.fn().mockResolvedValue(undefined) };

    service = new ScansService(
      prisma,
      filterService,
      diagnosisService,
      workOrdersService,
      n8nService,
      pushService,
    );
  });

  it('lanza un error y no crea el escaneo si el vehículo no existe', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);

    await expect(service.create(DTO, USER_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.scan.create).not.toHaveBeenCalled();
  });

  it('escaneo sin fallas: crea el escaneo sin orden, sin avisos y sin IA', async () => {
    filterService.evaluateScan.mockReturnValue(evaluacion(false));

    const resultado = await service.create(DTO, USER_ID);

    expect(prisma.scan.create).toHaveBeenCalledTimes(1);
    expect(workOrdersService.createOrUpdateForScan).not.toHaveBeenCalled();
    expect(n8nService.notificarAlerta).not.toHaveBeenCalled();
    expect(pushService.notificarOrden).not.toHaveBeenCalled();
    expect(diagnosisService.processScan).not.toHaveBeenCalled();
    expect(resultado.workOrderId).toBeNull();
    expect(resultado.diagnosis.status).toBe('no requerida');
  });

  it('requiere evaluación y la orden es nueva: crea la orden, avisa por n8n y push, y llama a la IA', async () => {
    filterService.evaluateScan.mockReturnValue(evaluacion(true));
    workOrdersService.createOrUpdateForScan.mockResolvedValue({
      orden: { id: 'wo-1' },
      creada: true,
    });
    workOrdersService.countOpenByVehicle.mockResolvedValue(1);

    const resultado = await service.create(DTO, USER_ID);

    expect(workOrdersService.createOrUpdateForScan).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: VEHICULO.id,
        scanId: ESCANEO.id,
        codes: ['P0300'],
      }),
    );
    expect(n8nService.notificarAlerta).toHaveBeenCalledWith('wo-1');
    expect(pushService.notificarOrden).toHaveBeenCalledWith('wo-1');
    expect(diagnosisService.processScan).toHaveBeenCalledWith(ESCANEO.id);
    expect(resultado.workOrderId).toBe('wo-1');
    expect(resultado.diagnosis.status).toBe('generando');
  });

  it('requiere evaluación y la orden ya existía: la actualiza, no avisa y sí llama a la IA', async () => {
    filterService.evaluateScan.mockReturnValue(evaluacion(true));
    workOrdersService.createOrUpdateForScan.mockResolvedValue({
      orden: { id: 'wo-1' },
      creada: false,
    });
    workOrdersService.countOpenByVehicle.mockResolvedValue(1);

    const resultado = await service.create(DTO, USER_ID);

    expect(workOrdersService.createOrUpdateForScan).toHaveBeenCalledTimes(1);
    expect(n8nService.notificarAlerta).not.toHaveBeenCalled();
    expect(pushService.notificarOrden).not.toHaveBeenCalled();
    expect(diagnosisService.processScan).toHaveBeenCalledWith(ESCANEO.id);
    expect(resultado.workOrderId).toBeNull();
  });
});
