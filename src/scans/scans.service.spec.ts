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
import {
  DIAS_GRACIA_TRAS_REPARACION,
  pareceSecuelaDeReparacion,
} from './post-reparacion';

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
      workOrder: { findFirst: jest.fn().mockResolvedValue(null) },
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

  describe('falsa alarma tras una reparación reciente', () => {
    const PERMANENTE: any = {
      vehicleId: VEHICULO.id,
      dtcs: [{ code: 'p0300', type: 'PERMANENT' }],
      readinessStatus: { monitorsCompleted: false, incompleteMonitors: ['CAT'] },
    };
    const haceDias = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

    beforeEach(() => {
      // Lo que el filtro dice de un permanente con monitores incompletos.
      filterService.evaluateScan.mockReturnValue({
        requiresAiEvaluation: true,
        severity: 'MEDIUM',
        rationale: 'Código PERMANENTE con monitores incompletos.',
        vehicleStatus: 'ALERT',
      });
    });

    it('con una orden completada hace pocos días: no abre orden ni pide IA', async () => {
      prisma.workOrder.findFirst.mockResolvedValue({ closedAt: haceDias(3) });

      const resultado = await service.create(PERMANENTE, USER_ID);

      expect(workOrdersService.createOrUpdateForScan).not.toHaveBeenCalled();
      expect(diagnosisService.processScan).not.toHaveBeenCalled();
      expect(n8nService.notificarAlerta).not.toHaveBeenCalled();
      expect(resultado.workOrderId).toBeNull();
      expect(resultado.evaluation.vehicleStatus).toBe('ALERT');
      expect(resultado.evaluation.severity).toBe('LOW');
      expect(resultado.evaluation.rationale).toContain('reparación reciente');

      const guardado = prisma.scan.create.mock.calls[0][0].data;
      expect(guardado.rationale).toContain('reparación reciente');
      expect(guardado.severity).toBe('LOW');

      // Solo busca reparaciones completadas dentro de la ventana.
      const filtro = prisma.workOrder.findFirst.mock.calls[0][0].where;
      expect(filtro.status).toBe('COMPLETED');
      const desde: Date = filtro.closedAt.gte;
      const dias = (Date.now() - desde.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(dias)).toBe(DIAS_GRACIA_TRAS_REPARACION);
    });

    it('sin reparación reciente: sigue las reglas de siempre', async () => {
      prisma.workOrder.findFirst.mockResolvedValue(null);
      workOrdersService.createOrUpdateForScan.mockResolvedValue({
        orden: { id: 'wo-2' },
        creada: true,
      });

      const resultado = await service.create(PERMANENTE, USER_ID);

      expect(workOrdersService.createOrUpdateForScan).toHaveBeenCalled();
      expect(resultado.workOrderId).toBe('wo-2');
    });

    it('un código CONFIRMED o PENDING no entra en la excepción', async () => {
      workOrdersService.createOrUpdateForScan.mockResolvedValue({
        orden: { id: 'wo-3' },
        creada: true,
      });

      await service.create(
        {
          ...PERMANENTE,
          dtcs: [
            { code: 'P0300', type: 'PERMANENT' },
            { code: 'P0171', type: 'PENDING' },
          ],
        },
        USER_ID,
      );

      expect(prisma.workOrder.findFirst).not.toHaveBeenCalled();
      expect(workOrdersService.createOrUpdateForScan).toHaveBeenCalled();
    });

    it('con los monitores completos no entra en la excepción', async () => {
      workOrdersService.createOrUpdateForScan.mockResolvedValue({
        orden: { id: 'wo-4' },
        creada: true,
      });

      await service.create(
        { ...PERMANENTE, readinessStatus: { monitorsCompleted: true } },
        USER_ID,
      );

      expect(prisma.workOrder.findFirst).not.toHaveBeenCalled();
      expect(workOrdersService.createOrUpdateForScan).toHaveBeenCalled();
    });
  });
});

describe('pareceSecuelaDeReparacion', () => {
  it('solo permanentes con monitores incompletos', () => {
    expect(pareceSecuelaDeReparacion([{ type: 'PERMANENT' }], false)).toBe(true);
    expect(pareceSecuelaDeReparacion([{ type: 'PERMANENT' }], true)).toBe(false);
    expect(pareceSecuelaDeReparacion([{ type: 'PERMANENT' }], undefined)).toBe(false);
    expect(
      pareceSecuelaDeReparacion([{ type: 'PERMANENT' }, { type: 'CONFIRMED' }], false),
    ).toBe(false);
    expect(pareceSecuelaDeReparacion([], false)).toBe(false);
  });
});
