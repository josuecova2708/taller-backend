// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU17. Notificar Alerta de Mantenimiento
// Método evaluado: N8nService.notificarAlerta(workOrderId: string)
// Complejidad Ciclomática V(G) = 4 + 1 = 5 caminos independientes
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

describe('9.3.2. Pruebas de caja blanca — CU17. Notificar Alerta de Mantenimiento', () => {
  const ordenMock = {
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
  };

  function crearConfig(url: string | undefined) {
    return {
      get: jest.fn((key: string) => {
        if (key === 'N8N_WEBHOOK_URL') return url;
        if (key === 'N8N_WEBHOOK_SECRET') return 'secreto-uagrm';
        return 'http://localhost:3001';
      }),
    };
  }

  it('Camino 1 (1,2,3,11): retorna enviado=false cuando N8N_WEBHOOK_URL no está configurado (!url)', async () => {
    const configMock = crearConfig(undefined);
    const prismaMock = { workOrder: { findUnique: jest.fn() } };
    const n8nService = new N8nService(configMock as any, prismaMock as any);

    const resultado = await n8nService.notificarAlerta('wo-tacoma-001');

    expect(resultado).toEqual({
      enviado: false,
      motivo: 'Los avisos por n8n no están configurados.',
    });
    expect(prismaMock.workOrder.findUnique).not.toHaveBeenCalled();
  });

  it('Camino 2 (1,2,4,5,11): retorna enviado=false cuando la orden de trabajo no existe en la base (!orden)', async () => {
    const configMock = crearConfig('http://localhost:5678/webhook/scan-alert');
    const prismaMock = {
      workOrder: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const n8nService = new N8nService(configMock as any, prismaMock as any);

    const resultado = await n8nService.notificarAlerta('wo-inexistente');

    expect(resultado).toEqual({
      enviado: false,
      motivo: 'La orden de trabajo no existe.',
    });
  });

  it('Camino 3 (1,2,4,6,7,8,11): registra notificación FAILED y retorna enviado=false cuando n8n responde con estado HTTP no exitoso (!respuesta.ok)', async () => {
    const configMock = crearConfig('http://localhost:5678/webhook/scan-alert');
    const prismaMock = {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(ordenMock),
        update: jest.fn(),
      },
    };
    const fetchOriginal = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as any);

    try {
      const n8nService = new N8nService(configMock as any, prismaMock as any);
      const resultado = await n8nService.notificarAlerta('wo-tacoma-001');

      expect(resultado).toEqual({
        enviado: false,
        motivo: 'El servicio de avisos respondió con un error (500).',
      });
      expect(prismaMock.workOrder.update).not.toHaveBeenCalled();
    } finally {
      global.fetch = fetchOriginal;
    }
  });

  it('Camino 4 (1,2,4,6,7,9,11): actualiza n8nNotified=true y retorna enviado=true cuando el webhook responde HTTP 200 OK', async () => {
    const configMock = crearConfig('http://localhost:5678/webhook/scan-alert');
    const prismaMock = {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(ordenMock),
        update: jest.fn().mockResolvedValue({ id: 'wo-tacoma-001', n8nNotified: true }),
      },
    };
    const fetchOriginal = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as any);

    try {
      const n8nService = new N8nService(configMock as any, prismaMock as any);
      const resultado = await n8nService.notificarAlerta('wo-tacoma-001');

      expect(resultado).toEqual({ enviado: true });
      expect(prismaMock.workOrder.update).toHaveBeenCalledWith({
        where: { id: 'wo-tacoma-001' },
        data: { n8nNotified: true },
      });
    } finally {
      global.fetch = fetchOriginal;
    }
  });

  it('Camino 5 (1,2,4,6,10,11): captura excepción de red en catch y retorna enviado=false cuando fetch lanza error de conexión', async () => {
    const configMock = crearConfig('http://localhost:5678/webhook/scan-alert');
    const prismaMock = {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(ordenMock),
        update: jest.fn(),
      },
    };
    const fetchOriginal = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      const n8nService = new N8nService(configMock as any, prismaMock as any);
      const resultado = await n8nService.notificarAlerta('wo-tacoma-001');

      expect(resultado).toEqual({
        enviado: false,
        motivo: 'No se pudo conectar con el servicio de avisos.',
      });
      expect(prismaMock.workOrder.update).not.toHaveBeenCalled();
    } finally {
      global.fetch = fetchOriginal;
    }
  });
});
