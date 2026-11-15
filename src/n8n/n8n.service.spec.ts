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

import { N8nService } from './n8n.service';
import { construirAlerta, construirResumen } from './n8n.messages';

const AHORA = new Date('2026-11-14T12:00:00Z');
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 24 * 60 * 60 * 1000);

const ORDEN = {
  id: 'orden-1',
  priority: 'CRITICAL',
  status: 'OPEN',
  description: 'Dos códigos confirmados con recurrencia.',
  createdAt: haceDias(2),
  vehicle: { plate: '5521-TAC', alias: 'Camioneta Agrícolas' },
  assignedTo: null,
  scan: { dtcEntries: [{ code: 'P0300' }, { code: 'P0301' }] },
};

describe('Mensajes para n8n', () => {
  it('redacta la alerta de una orden nueva con placa, códigos y enlace', () => {
    const alerta = construirAlerta(ORDEN, 'https://taller.example/');

    expect(alerta.evento).toBe('orden_creada');
    expect(alerta.mensaje).toContain('prioridad crítica');
    expect(alerta.mensaje).toContain('5521-TAC (Camioneta Agrícolas)');
    expect(alerta.mensaje).toContain('P0300, P0301');
    expect(alerta.mensaje).toContain(
      'https://taller.example/dashboard/work-orders/orden-1',
    );
    expect(alerta.codigos).toEqual(['P0300', 'P0301']);
  });

  it('omite el enlace si no se configuró la dirección de la web', () => {
    expect(construirAlerta(ORDEN).mensaje).not.toContain('Ver la orden');
  });

  it('el resumen ordena por prioridad y cuenta las órdenes sin mecánico', () => {
    const resumen = construirResumen(
      [
        { ...ORDEN, id: 'o-baja', priority: 'LOW', assignedTo: { name: 'Marta' } },
        ORDEN,
      ],
      [],
      AHORA,
    );

    expect(resumen.ordenesSinCerrar).toBe(2);
    expect(resumen.ordenesSinAsignar).toBe(1);
    expect(resumen.ordenes.map((o) => o.id)).toEqual(['orden-1', 'o-baja']);
    expect(resumen.ordenes[0].diasAbierta).toBe(2);
    expect(resumen.mensaje).toContain('sin mecánico asignado');
  });

  it('el resumen lista los vehículos sin escaneo en 30 días o nunca escaneados', () => {
    const resumen = construirResumen(
      [],
      [
        { plate: 'AL-DIA', alias: null, scans: [{ scannedAt: haceDias(3) }] },
        { plate: 'ATRASADO', alias: null, scans: [{ scannedAt: haceDias(41) }] },
        { plate: 'NUEVO', alias: null, scans: [] },
      ],
      AHORA,
    );

    expect(resumen.vehiculosSinEscaneo.map((v) => v.placa)).toEqual([
      'NUEVO',
      'ATRASADO',
    ]);
    expect(resumen.mensaje).toContain('No hay órdenes de trabajo sin cerrar.');
    expect(resumen.mensaje).toContain('ATRASADO: 41 días sin escaneo');
    expect(resumen.mensaje).toContain('NUEVO: nunca fue escaneado');
  });
});

describe('N8nService.notificarAlerta', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  function construir(env: Record<string, string>) {
    const prisma = {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(ORDEN),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const config = { get: (clave: string) => env[clave] };
    return { servicio: new N8nService(config as any, prisma as any), prisma };
  }

  it('sin URL configurada no intenta enviar nada', async () => {
    global.fetch = jest.fn() as any;
    const { servicio } = construir({});

    const resultado = await servicio.notificarAlerta('orden-1');

    expect(resultado.enviado).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('envía el aviso con la cabecera secreta y marca la orden como notificada', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
    const { servicio, prisma } = construir({
      N8N_WEBHOOK_URL: 'https://n8n.example/webhook/taller-scan-alert',
      N8N_WEBHOOK_SECRET: 'secreto',
    });

    const resultado = await servicio.notificarAlerta('orden-1');

    expect(resultado.enviado).toBe(true);
    const [url, opciones] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://n8n.example/webhook/taller-scan-alert');
    expect(opciones.headers['X-Webhook-Secret']).toBe('secreto');
    expect(JSON.parse(opciones.body).vehiculo.placa).toBe('5521-TAC');
    expect(prisma.workOrder.update).toHaveBeenCalledWith({
      where: { id: 'orden-1' },
      data: { n8nNotified: true },
    });
  });

  it('si n8n falla no lanza ni marca la orden', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const { servicio, prisma } = construir({
      N8N_WEBHOOK_URL: 'https://n8n.example/webhook/taller-scan-alert',
    });

    const resultado = await servicio.notificarAlerta('orden-1');

    expect(resultado.enviado).toBe(false);
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('una respuesta de error de n8n tampoco marca la orden', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as any;
    const { servicio, prisma } = construir({
      N8N_WEBHOOK_URL: 'https://n8n.example/webhook/taller-scan-alert',
    });

    const resultado = await servicio.notificarAlerta('orden-1');

    expect(resultado.enviado).toBe(false);
    expect(resultado.motivo).toContain('403');
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });
});
