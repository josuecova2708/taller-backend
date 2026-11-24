// ============================================================================
// 9.3.1. Pruebas de caja negra — CU17. Notificar Alerta de Mantenimiento
// ============================================================================

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
}));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import { N8nService } from '../n8n/n8n.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU17. Notificar Alerta de Mantenimiento', () => {
    it('Prueba de CU17 Notificar Alerta de Mantenimiento', async () => {
      // Precondición: Se creó una orden de trabajo de prioridad ALTA/CRÍTICA
      // y el webhook de n8n se encuentra configurado.
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'N8N_WEBHOOK_URL') return 'http://localhost:5678/webhook/scan-alert';
          if (key === 'N8N_WEBHOOK_SECRET') return 'secreto-uagrm';
          return 'http://localhost:3001';
        }),
      };

      const prismaMock = {
        workOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'wo-tacoma-001',
            priority: WorkOrderPriority.CRITICAL,
            status: WorkOrderStatus.OPEN,
            description: 'Evaluación prioritaria cilindro 1 (P0300 / P0301)',
            createdAt: new Date('2026-11-23T14:00:00Z'),
            vehicle: {
              plate: '5521-TAC',
              alias: 'Camioneta Ciencias Agrícolas',
              responsible: { name: 'Carlos Inspector' },
            },
            assignedTo: null,
            scan: {
              dtcEntries: [{ code: 'P0300' }, { code: 'P0301' }],
            },
          }),
          update: jest.fn().mockResolvedValue({ id: 'wo-tacoma-001', n8nNotified: true }),
        },
      };

      const fetchOriginal = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as any);

      try {
        const n8nService = new N8nService(configMock as any, prismaMock as any);

        // Condición de ejecución: Despacho de la alerta de mantenimiento hacia n8n
        const resultado = await n8nService.notificarAlerta('wo-tacoma-001');

        // Resultado Esperado / Obtenido
        expect(resultado.enviado).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(prismaMock.workOrder.update).toHaveBeenCalledWith({
          where: { id: 'wo-tacoma-001' },
          data: { n8nNotified: true },
        });
      } finally {
        global.fetch = fetchOriginal;
      }
    });
  });
});
