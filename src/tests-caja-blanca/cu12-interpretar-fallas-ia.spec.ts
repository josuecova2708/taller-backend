// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU12. Interpretar Fallas con IA
// Método evaluado: DiagnosisService.processScan(scanId: string)
// Complejidad Ciclomática V(G) = 3 + 1 = 4 caminos independientes
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
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../ai/ai.service', () => ({ AiService: class {} }));
jest.mock('../work-orders/work-orders.service', () => ({ WorkOrdersService: class {} }));

import { DtcType, ScanSeverity } from '@prisma/client';
import { DiagnosisService } from '../diagnosis/diagnosis.service';

describe('9.3.2. Pruebas de caja blanca — CU12. Interpretar Fallas con IA', () => {
  const scanMock = {
    id: 'scan-001',
    vehicleId: 'veh-tacoma-5521',
    scannedAt: new Date('2026-11-22T14:00:00Z'),
    batteryVoltage: 13.3,
    readinessStatus: { milOn: true, dtcCount: 2, monitorsCompleted: true, incompleteMonitors: [] },
    severity: ScanSeverity.CRITICAL,
    rationale: 'Fallo de encendido confirmado en cilindro 1.',
    notes: null,
    vehicle: {
      plate: '5521-TAC',
      alias: 'Camioneta Ciencias Agrícolas',
      make: 'Toyota',
      model: 'Tacoma',
      year: 2021,
      vin: '5TFCZ5AN3MX255216',
    },
    dtcEntries: [
      { code: 'P0300', type: DtcType.CONFIRMED },
      { code: 'P0301', type: DtcType.CONFIRMED },
    ],
  };

  const resultadoIaMock = {
    provider: 'claude',
    model: 'claude-sonnet-5',
    prompt: 'Prompt técnico...',
    rawResponse: '{"summary":"Fallo en cilindro 1"}',
    tokensUsed: 840,
    latencyMs: 3200,
    hypothesis: {
      summary: 'Fallo de encendido focalizado en la bobina del cilindro 1.',
      severity: ScanSeverity.CRITICAL,
      probableCauses: [{ cause: 'Bobina del cilindro 1 en corto', confidence: 'ALTA' }],
      verificationSteps: ['Intercambiar bobina 1 con cilindro 2', 'Inspeccionar bujía 1'],
      correlations: 'P0300 deriva de P0301.',
    },
  };

  it('Camino 1 (1,2,3,9): captura el error en catch y conserva aiProcessed=false cuando el escaneo no existe', async () => {
    const prismaMock = {
      scan: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      diagnosis: { upsert: jest.fn() },
    };
    const aiMock = { diagnose: jest.fn() };
    const workOrdersMock = { attachDiagnosis: jest.fn() };

    const service = new DiagnosisService(prismaMock as any, aiMock as any, workOrdersMock as any);
    await service.processScan('scan-inexistente');

    expect(aiMock.diagnose).not.toHaveBeenCalled();
    expect(prismaMock.diagnosis.upsert).not.toHaveBeenCalled();
  });

  it('Camino 2 (1,2,4,8,9): captura el error en catch cuando el proveedor de IA falla (AiProviderError / Timeout)', async () => {
    const prismaMock = {
      scan: {
        findUnique: jest.fn().mockResolvedValue(scanMock),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      diagnosis: { upsert: jest.fn() },
    };
    const aiMock = {
      diagnose: jest.fn().mockRejectedValue(new Error('Claude API timeout')),
    };
    const workOrdersMock = { attachDiagnosis: jest.fn() };

    const service = new DiagnosisService(prismaMock as any, aiMock as any, workOrdersMock as any);
    await service.processScan('scan-001');

    expect(prismaMock.diagnosis.upsert).not.toHaveBeenCalled();
    expect(prismaMock.scan.update).not.toHaveBeenCalled();
  });

  it('Camino 3 (1,2,4,5,6,9): persiste la hipótesis y la vincula a la orden de trabajo propia cuando orden != null', async () => {
    const prismaMock = {
      scan: {
        findUnique: jest.fn().mockResolvedValue(scanMock),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'scan-001', aiProcessed: true }),
      },
      diagnosis: {
        upsert: jest.fn().mockResolvedValue({ id: 'diag-001' }),
      },
      workOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wo-001', scanId: 'scan-001' }),
      },
    };
    const aiMock = { diagnose: jest.fn().mockResolvedValue(resultadoIaMock) };
    const workOrdersMock = { attachDiagnosis: jest.fn().mockResolvedValue({}) };

    const service = new DiagnosisService(prismaMock as any, aiMock as any, workOrdersMock as any);
    await service.processScan('scan-001');

    expect(prismaMock.diagnosis.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.scan.update).toHaveBeenCalledWith({
      where: { id: 'scan-001' },
      data: { aiProcessed: true },
    });
    expect(workOrdersMock.attachDiagnosis).toHaveBeenCalledWith(
      'wo-001',
      'diag-001',
      resultadoIaMock.hypothesis.summary,
    );
  });

  it('Camino 4 (1,2,4,5,7,9): persiste la hipótesis solo en el escaneo sin vincular orden cuando orden == null (deduplicación)', async () => {
    const prismaMock = {
      scan: {
        findUnique: jest.fn().mockResolvedValue(scanMock),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'scan-001', aiProcessed: true }),
      },
      diagnosis: {
        upsert: jest.fn().mockResolvedValue({ id: 'diag-002' }),
      },
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const aiMock = { diagnose: jest.fn().mockResolvedValue(resultadoIaMock) };
    const workOrdersMock = { attachDiagnosis: jest.fn() };

    const service = new DiagnosisService(prismaMock as any, aiMock as any, workOrdersMock as any);
    await service.processScan('scan-001');

    expect(prismaMock.diagnosis.upsert).toHaveBeenCalledTimes(1);
    expect(workOrdersMock.attachDiagnosis).not.toHaveBeenCalled();
  });
});
