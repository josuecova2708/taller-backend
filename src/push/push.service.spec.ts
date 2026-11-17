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
// Firebase no se carga en las pruebas: el emisor se sustituye por uno falso.
jest.mock('firebase-admin/app', () => ({
  cert: jest.fn(),
  initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn() }));

import { PushService } from './push.service';
import {
  construirPush,
  construirPushCierre,
  construirPushResponsable,
  leerCuentaServicio,
} from './push.messages';

const ORDEN = {
  id: 'orden-1',
  priority: 'CRITICAL',
  status: 'OPEN',
  description: 'Dos códigos confirmados con recurrencia.',
  createdAt: new Date('2026-11-14T12:00:00Z'),
  vehicle: { plate: '5521-TAC', alias: 'Camioneta Agrícolas' },
  scan: { dtcEntries: [{ code: 'P0300' }] },
};

const CLAVE = {
  project_id: 'taller-obd',
  client_email: 'push@taller-obd.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
};

describe('Texto del push', () => {
  it('orden nueva: invita a tomarla, con placa, prioridad y el id de la orden', () => {
    const push = construirPush(ORDEN);

    expect(`${push.titulo} ${push.cuerpo}`).toContain(
      'Nueva orden para 5521-TAC (prioridad crítica). Ábrala para tomarla.',
    );
    expect(push.cuerpo).toContain('Dos códigos confirmados con recurrencia.');
    expect(push.datos).toEqual({
      tipo: 'orden_creada',
      workOrderId: 'orden-1',
      placa: '5521-TAC',
      prioridad: 'CRITICAL',
    });
  });

  it('recorta un resumen largo', () => {
    const push = construirPush({ ...ORDEN, description: 'falla '.repeat(100) });

    expect(push.cuerpo.length).toBeLessThanOrEqual(180);
    expect(push.cuerpo.endsWith('…')).toBe(true);
  });

  it('al responsable: su vehículo necesita revisión, y abre el escaneo', () => {
    const push = construirPushResponsable({ ...ORDEN, scanId: 'scan-1' });

    expect(push.titulo).toBe('Su vehículo 5521-TAC necesita revisión en el taller.');
    expect(push.datos.scanId).toBe('scan-1');
    // El inspector no puede abrir órdenes: el push no trae la orden.
    expect(push.datos.workOrderId).toBeUndefined();
  });

  it('cierre como completada: dice quién la cerró y que vuelve a operar', () => {
    const push = construirPushCierre({
      id: 'orden-1',
      status: 'COMPLETED',
      vehicle: { plate: '5521-TAC' },
      closedBy: { name: 'Marta' },
    });

    expect(push.cuerpo).toBe(
      'La orden de 5521-TAC fue cerrada por Marta. El vehículo vuelve a estar operativo.',
    );
  });

  it('cierre como cancelada: no dice que el vehículo vuelve a operar', () => {
    const push = construirPushCierre({
      id: 'orden-1',
      status: 'CANCELLED',
      vehicle: { plate: '5521-TAC' },
      closedBy: { name: 'Ana' },
    });

    expect(push.cuerpo).toContain('fue cancelada por Ana');
    expect(push.cuerpo).not.toContain('operativo');
  });
});

describe('Clave de la cuenta de servicio', () => {
  const sinArchivo = () => {
    throw new Error('no debería leer un archivo');
  };

  it('acepta el JSON directo y restaura los saltos de línea de la clave', () => {
    const cuenta = leerCuentaServicio(JSON.stringify(CLAVE), sinArchivo);

    expect(cuenta.projectId).toBe('taller-obd');
    expect(cuenta.privateKey).toContain('KEY-----\nabc\n-----END');
  });

  it('acepta el JSON en base64', () => {
    const base64 = Buffer.from(JSON.stringify(CLAVE)).toString('base64');

    expect(leerCuentaServicio(base64, sinArchivo).clientEmail).toBe(
      CLAVE.client_email,
    );
  });

  it('acepta la ruta a un archivo .json', () => {
    const leer = jest.fn().mockReturnValue(JSON.stringify(CLAVE));

    expect(leerCuentaServicio('secrets/clave.json', leer).projectId).toBe(
      'taller-obd',
    );
    expect(leer).toHaveBeenCalledWith('secrets/clave.json');
  });

  it('rechaza un archivo que no es una clave de cuenta de servicio', () => {
    // Error típico: pegar el google-services.json de la app.
    const ajeno = JSON.stringify({ project_info: { project_id: 'taller-obd' } });

    expect(() => leerCuentaServicio(ajeno, sinArchivo)).toThrow(
      /cuenta de servicio/,
    );
  });

  it('no repite el valor recibido en el mensaje de error', () => {
    expect(() => leerCuentaServicio('valor-secreto', sinArchivo)).toThrow(
      /JSON válido/,
    );
    expect(() => leerCuentaServicio('valor-secreto', sinArchivo)).not.toThrow(
      /valor-secreto/,
    );
  });
});

describe('PushService', () => {
  function crear(opciones: { clave?: string; emisor?: any } = {}) {
    const prisma = {
      workOrder: { findUnique: jest.fn().mockResolvedValue(ORDEN) },
      device: {
        findMany: jest.fn().mockResolvedValue([{ token: 't-1' }, { token: 't-2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({ id: 'd-1', platform: 'android' }),
      },
    };
    const config = { get: jest.fn().mockReturnValue(opciones.clave) };
    const servicio = new PushService(config as any, prisma as any);
    if (opciones.emisor) {
      jest
        .spyOn(servicio as any, 'obtenerEmisor')
        .mockReturnValue(opciones.emisor);
    }
    return { servicio, prisma };
  }

  const emisorQueEntrega = () => ({
    sendEachForMulticast: jest.fn().mockResolvedValue({
      successCount: 2,
      responses: [{ success: true }, { success: true }],
    }),
  });

  it('sin clave de Firebase no envía y explica por qué', async () => {
    const { servicio, prisma } = crear();

    const resultado = await servicio.notificarOrden('orden-1');

    expect(resultado.enviado).toBe(false);
    expect(resultado.motivo).toContain('no están configuradas');
    expect(prisma.workOrder.findUnique).not.toHaveBeenCalled();
  });

  it('con una clave inválida no lanza: queda deshabilitado', async () => {
    const { servicio } = crear({ clave: 'esto no es una clave' });

    await expect(servicio.notificarOrden('orden-1')).resolves.toMatchObject({
      enviado: false,
    });
  });

  it('envía la orden a los teléfonos de administradores y mecánicos activos', async () => {
    const emisor = emisorQueEntrega();
    const { servicio, prisma } = crear({ emisor });

    const resultado = await servicio.notificarOrden('orden-1');

    expect(resultado).toEqual({ enviado: true, dispositivos: 2 });
    const filtro = prisma.device.findMany.mock.calls[0][0].where.user;
    expect(filtro.active).toBe(true);
    expect([...filtro.role.in].sort()).toEqual(['ADMIN', 'MECHANIC']);

    const mensaje = emisor.sendEachForMulticast.mock.calls[0][0];
    expect(mensaje.tokens).toEqual(['t-1', 't-2']);
    expect(mensaje.notification.title).toContain('5521-TAC');
    expect(mensaje.data.workOrderId).toBe('orden-1');
    expect(mensaje.android.notification.channelId).toBe('alertas');
  });

  it('orden nueva: también avisa al responsable del vehículo, con su propio texto', async () => {
    const emisor = emisorQueEntrega();
    const { servicio, prisma } = crear({ emisor });
    prisma.workOrder.findUnique.mockResolvedValue({
      ...ORDEN,
      scanId: 'scan-1',
      vehicle: { ...ORDEN.vehicle, responsibleId: 'ins-1', responsible: { name: 'Carlos' } },
    });
    prisma.device.findMany
      .mockResolvedValueOnce([{ token: 't-1' }])
      .mockResolvedValueOnce([{ token: 't-ins' }]);

    await servicio.notificarOrden('orden-1');

    expect(prisma.device.findMany.mock.calls[1][0].where).toEqual({
      userId: 'ins-1',
      user: { active: true },
    });
    expect(emisor.sendEachForMulticast).toHaveBeenCalledTimes(2);
    const alResponsable = emisor.sendEachForMulticast.mock.calls[1][0];
    expect(alResponsable.tokens).toEqual(['t-ins']);
    expect(alResponsable.notification.title).toBe(
      'Su vehículo 5521-TAC necesita revisión en el taller.',
    );
    expect(alResponsable.data.scanId).toBe('scan-1');
  });

  it('orden nueva sin responsable: un solo envío', async () => {
    const emisor = emisorQueEntrega();
    const { servicio } = crear({ emisor });

    await servicio.notificarOrden('orden-1');

    expect(emisor.sendEachForMulticast).toHaveBeenCalledTimes(1);
  });

  it('cierre: avisa al responsable y a los administradores, no a quien cerró', async () => {
    const emisor = emisorQueEntrega();
    const { servicio, prisma } = crear({ emisor });
    prisma.workOrder.findUnique.mockResolvedValue({
      id: 'orden-1',
      scanId: 'scan-1',
      status: 'COMPLETED',
      closedById: 'mec-1',
      vehicle: { plate: '5521-TAC', responsibleId: 'ins-1' },
      closedBy: { name: 'Marta' },
    });

    const resultado = await servicio.notificarCierre('orden-1');

    expect(resultado.enviado).toBe(true);
    const filtro = prisma.device.findMany.mock.calls[0][0].where.user;
    expect(filtro.active).toBe(true);
    expect(filtro.NOT).toEqual({ id: 'mec-1' });
    expect(filtro.OR).toEqual([{ role: { in: ['ADMIN'] } }, { id: 'ins-1' }]);
    expect(emisor.sendEachForMulticast.mock.calls[0][0].notification.body).toContain(
      'fue cerrada por Marta',
    );
  });

  it('cierre de un vehículo sin responsable: solo a los administradores', async () => {
    const emisor = emisorQueEntrega();
    const { servicio, prisma } = crear({ emisor });
    prisma.workOrder.findUnique.mockResolvedValue({
      id: 'orden-1',
      status: 'CANCELLED',
      closedById: 'admin-1',
      vehicle: { plate: '5521-TAC', responsibleId: null },
      closedBy: { name: 'Ana' },
    });

    await servicio.notificarCierre('orden-1');

    const filtro = prisma.device.findMany.mock.calls[0][0].where.user;
    expect(filtro.OR).toEqual([{ role: { in: ['ADMIN'] } }]);
  });

  it('el aviso de cierre nunca lanza', async () => {
    const emisor = {
      sendEachForMulticast: jest.fn().mockRejectedValue(new Error('sin red')),
    };
    const { servicio, prisma } = crear({ emisor });
    prisma.workOrder.findUnique.mockResolvedValue({
      id: 'orden-1',
      status: 'COMPLETED',
      closedById: 'mec-1',
      vehicle: { plate: '5521-TAC', responsibleId: null },
      closedBy: { name: 'Marta' },
    });

    await expect(servicio.notificarCierre('orden-1')).resolves.toMatchObject({
      enviado: false,
    });
  });

  it('borra los teléfonos que Firebase informa como inexistentes', async () => {
    const emisor = {
      sendEachForMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
        ],
      }),
    };
    const { servicio, prisma } = crear({ emisor });

    const resultado = await servicio.notificarOrden('orden-1');

    expect(resultado).toEqual({ enviado: true, dispositivos: 1 });
    expect(prisma.device.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['t-2'] } },
    });
  });

  it('un fallo pasajero de Firebase no borra el teléfono', async () => {
    const emisor = {
      sendEachForMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/internal-error' } },
        ],
      }),
    };
    const { servicio, prisma } = crear({ emisor });

    await servicio.notificarOrden('orden-1');

    expect(prisma.device.deleteMany).not.toHaveBeenCalled();
  });

  it('sin teléfonos registrados no llama a Firebase', async () => {
    const emisor = emisorQueEntrega();
    const { servicio, prisma } = crear({ emisor });
    prisma.device.findMany.mockResolvedValue([]);

    const resultado = await servicio.notificarOrden('orden-1');

    expect(resultado.enviado).toBe(false);
    expect(resultado.motivo).toContain('No hay teléfonos registrados');
    expect(emisor.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('si Firebase falla, no lanza', async () => {
    const emisor = {
      sendEachForMulticast: jest.fn().mockRejectedValue(new Error('sin red')),
    };
    const { servicio } = crear({ emisor });

    await expect(servicio.notificarOrden('orden-1')).resolves.toMatchObject({
      enviado: false,
    });
  });

  it('registrar un teléfono lo asocia a la cuenta que inició sesión', async () => {
    const { servicio, prisma } = crear({ emisor: emisorQueEntrega() });

    const resultado = await servicio.registrarDispositivo('u-1', 'token-largo');

    expect(prisma.device.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'token-largo' },
        create: { userId: 'u-1', token: 'token-largo', platform: 'android' },
        update: { userId: 'u-1', platform: 'android' },
      }),
    );
    expect(resultado.pushHabilitado).toBe(true);
  });

  it('al cerrar sesión solo quita el teléfono de la propia cuenta', async () => {
    const { servicio, prisma } = crear();

    await servicio.quitarDispositivo('u-1', 'token-largo');

    expect(prisma.device.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', token: 'token-largo' },
    });
  });

  it('la prueba va solo a los teléfonos de quien la pide', async () => {
    const emisor = emisorQueEntrega();
    const { servicio, prisma } = crear({ emisor });

    await servicio.enviarPrueba('u-1');

    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      select: { token: true },
    });
    expect(emisor.sendEachForMulticast.mock.calls[0][0].data).toEqual({
      tipo: 'prueba',
    });
  });
});
