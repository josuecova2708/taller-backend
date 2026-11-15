// NestJS 12 es ESM-first ("type": "module") y ts-jest corre en CommonJS, así
// que importar @nestjs/common de verdad rompe la suite. Mismo workaround que
// ya usaba deterministic-filter.service.spec.ts.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
}));

// Se stubea el servicio real para no cargar el adaptador de Neon ni abrir
// WebSockets: estas pruebas inyectan un Prisma falso.
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('../obd/vehicle-status.service', () => ({
  VehicleStatusService: class {},
}));

import {
  ScanSeverity,
  UserRole,
  VehicleStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';
import {
  WorkOrdersService,
  prioridadDesdeSeveridad,
  prioridadMasAlta,
} from './work-orders.service';
import { resolverEstadoVehiculo } from '../scans/vehicle-status';

describe('Mapeo de severidad a prioridad', () => {
  it('traduce cada severidad de escaneo a una prioridad de orden', () => {
    expect(prioridadDesdeSeveridad(ScanSeverity.NONE)).toBe(WorkOrderPriority.LOW);
    expect(prioridadDesdeSeveridad(ScanSeverity.LOW)).toBe(WorkOrderPriority.LOW);
    expect(prioridadDesdeSeveridad(ScanSeverity.MEDIUM)).toBe(WorkOrderPriority.MEDIUM);
    expect(prioridadDesdeSeveridad(ScanSeverity.HIGH)).toBe(WorkOrderPriority.HIGH);
    expect(prioridadDesdeSeveridad(ScanSeverity.CRITICAL)).toBe(
      WorkOrderPriority.CRITICAL,
    );
  });

  it('nunca degrada una prioridad ya asignada', () => {
    // Una falla que reaparece no es menos grave que antes.
    expect(prioridadMasAlta(WorkOrderPriority.CRITICAL, WorkOrderPriority.LOW)).toBe(
      WorkOrderPriority.CRITICAL,
    );
    expect(prioridadMasAlta(WorkOrderPriority.LOW, WorkOrderPriority.HIGH)).toBe(
      WorkOrderPriority.HIGH,
    );
    expect(prioridadMasAlta(WorkOrderPriority.MEDIUM, WorkOrderPriority.MEDIUM)).toBe(
      WorkOrderPriority.MEDIUM,
    );
  });
});

describe('WorkOrdersService.createOrUpdateForScan', () => {
  function construirServicio(ordenesAbiertas: any[]) {
    const prisma = {
      workOrder: {
        findMany: jest.fn().mockResolvedValue(ordenesAbiertas),
        findUnique: jest.fn().mockResolvedValue(ordenesAbiertas[0] ?? null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'orden-nueva', ...data }),
        ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, ...data }),
        ),
        count: jest.fn().mockResolvedValue(ordenesAbiertas.length),
      },
    };

    const vehicleStatus = {
      recomputeForVehicle: jest.fn().mockResolvedValue(VehicleStatus.OK),
    };

    return {
      servicio: new WorkOrdersService(prisma as any, vehicleStatus as any),
      prisma,
      vehicleStatus,
    };
  }

  const entrada = {
    vehicleId: 'veh-1',
    scanId: 'scan-2',
    severity: ScanSeverity.CRITICAL,
    rationale: 'Código confirmado con recurrencia histórica.',
    codes: ['P0300'],
  };

  it('crea una orden nueva cuando el vehículo no tiene ninguna abierta', async () => {
    const { servicio, prisma } = construirServicio([]);

    const { creada, orden } = await servicio.createOrUpdateForScan(entrada);

    expect(creada).toBe(true);
    expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
    expect(orden.priority).toBe(WorkOrderPriority.CRITICAL);
    expect(orden.status).toBe(WorkOrderStatus.OPEN);
    expect(orden.description).toContain('P0300');
  });

  it('NO duplica la orden cuando ya hay una abierta para el vehículo', async () => {
    // Regresión del diseño original: un bus escaneado cada semana sin reparar
    // acumulaba una orden abierta por semana.
    const { servicio, prisma } = construirServicio([
      {
        id: 'orden-1',
        priority: WorkOrderPriority.MEDIUM,
        status: WorkOrderStatus.OPEN,
        notes: null,
      },
    ]);

    const { creada, orden } = await servicio.createOrUpdateForScan(entrada);

    expect(creada).toBe(false);
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
    expect(prisma.workOrder.update).toHaveBeenCalledTimes(1);
    expect(orden.id).toBe('orden-1');
  });

  it('sube la prioridad de la orden existente si el escaneo nuevo es más grave', async () => {
    const { servicio } = construirServicio([
      {
        id: 'orden-1',
        priority: WorkOrderPriority.MEDIUM,
        status: WorkOrderStatus.IN_PROGRESS,
        notes: null,
      },
    ]);

    const { orden } = await servicio.createOrUpdateForScan(entrada);
    expect(orden.priority).toBe(WorkOrderPriority.CRITICAL);
  });

  it('no baja la prioridad si el escaneo nuevo es menos grave', async () => {
    const { servicio } = construirServicio([
      {
        id: 'orden-1',
        priority: WorkOrderPriority.CRITICAL,
        status: WorkOrderStatus.OPEN,
        notes: null,
      },
    ]);

    const { orden } = await servicio.createOrUpdateForScan({
      ...entrada,
      severity: ScanSeverity.MEDIUM,
    });

    expect(orden.priority).toBe(WorkOrderPriority.CRITICAL);
  });

  it('registra la recurrencia en las notas sin borrar las anteriores', async () => {
    const { servicio } = construirServicio([
      {
        id: 'orden-1',
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.OPEN,
        notes: 'Nota previa del mecánico.',
      },
    ]);

    const { orden } = await servicio.createOrUpdateForScan(entrada);

    expect(orden.notes).toContain('Nota previa del mecánico.');
    expect(orden.notes).toContain('Reaparece en un escaneo posterior (P0300)');
  });
});

describe('resolverEstadoVehiculo', () => {
  it('sin órdenes abiertas, aplica el resultado del escaneo tal cual', () => {
    expect(
      resolverEstadoVehiculo(VehicleStatus.OK, VehicleStatus.CRITICAL, false),
    ).toBe(VehicleStatus.OK);
  });

  it('con una orden abierta, un escaneo limpio NO devuelve el vehículo a OK', () => {
    // Regresión: borrar los códigos o desconectar la batería bastaba para que
    // un vehículo con falla sin reparar volviera a verde en el tablero.
    expect(
      resolverEstadoVehiculo(VehicleStatus.OK, VehicleStatus.CRITICAL, true),
    ).toBe(VehicleStatus.CRITICAL);
  });

  it('con una orden abierta, el estado sí puede empeorar', () => {
    expect(
      resolverEstadoVehiculo(VehicleStatus.CRITICAL, VehicleStatus.ALERT, true),
    ).toBe(VehicleStatus.CRITICAL);
  });

  it('con una orden abierta, mantiene el estado si es igual', () => {
    expect(
      resolverEstadoVehiculo(VehicleStatus.ALERT, VehicleStatus.ALERT, true),
    ).toBe(VehicleStatus.ALERT);
  });
});

const ADMIN = { sub: 'admin-1', role: UserRole.ADMIN };
const MECANICO = { sub: 'mec-1', role: UserRole.MECHANIC };
const OTRO_MECANICO = { sub: 'mec-2', role: UserRole.MECHANIC };

/** Servicio con un Prisma falso; `usuario` es lo que devuelve `user.findUnique`. */
function construir(orden: any, opciones: { usuario?: any; otrasAbiertas?: number } = {}) {
  const usuario =
    'usuario' in opciones
      ? opciones.usuario
      : { id: 'mec-1', name: 'Marta Mecánica', role: UserRole.MECHANIC, active: true };

  const prisma = {
    workOrder: {
      findUnique: jest.fn().mockResolvedValue(orden),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      count: jest.fn().mockResolvedValue(opciones.otrasAbiertas ?? 0),
    },
    user: { findUnique: jest.fn().mockResolvedValue(usuario) },
    vehicle: { update: jest.fn().mockResolvedValue({}) },
  };
  const vehicleStatus = {
    recomputeForVehicle: jest.fn().mockResolvedValue(VehicleStatus.CRITICAL),
  };
  return {
    servicio: new WorkOrdersService(prisma as any, vehicleStatus as any),
    prisma,
    vehicleStatus,
  };
}

const abierta = {
  id: 'orden-1',
  vehicleId: 'veh-1',
  assignedToId: 'mec-1',
  status: WorkOrderStatus.IN_PROGRESS,
  priority: WorkOrderPriority.CRITICAL,
  notes: 'Cambié la bobina del cilindro 1.',
};

describe('WorkOrdersService.advanceStatus', () => {
  it('el mecánico asignado puede avanzar la orden', async () => {
    const { servicio } = construir({ ...abierta, status: WorkOrderStatus.OPEN });

    const orden = await servicio.advanceStatus(
      'orden-1',
      WorkOrderStatus.IN_PROGRESS,
      undefined,
      MECANICO,
    );

    expect(orden.status).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  it('otro mecánico NO puede avanzar una orden ajena', async () => {
    const { servicio, prisma } = construir(abierta);

    await expect(
      servicio.advanceStatus('orden-1', WorkOrderStatus.IN_PROGRESS, 'x', OTRO_MECANICO),
    ).rejects.toThrow('asignada a otro mecánico');
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('un mecánico no puede avanzar una orden sin asignar', async () => {
    const { servicio } = construir({ ...abierta, assignedToId: null });

    await expect(
      servicio.advanceStatus('orden-1', WorkOrderStatus.IN_PROGRESS, 'x', MECANICO),
    ).rejects.toThrow('no tiene mecánico asignado');
  });

  it('el administrador puede avanzar cualquier orden', async () => {
    const { servicio } = construir(abierta);

    await expect(
      servicio.advanceStatus('orden-1', WorkOrderStatus.IN_PROGRESS, undefined, ADMIN),
    ).resolves.toBeDefined();
  });

  it('agrega la nota con fecha y autor sin borrar las anteriores', async () => {
    // Regresión: la nota nueva reemplazaba todo el campo.
    const { servicio } = construir(abierta);

    const orden = await servicio.advanceStatus(
      'orden-1',
      WorkOrderStatus.IN_PROGRESS,
      'Probé compresión: cilindro 1 bajo.',
      MECANICO,
    );

    expect(orden.notes).toContain('Cambié la bobina del cilindro 1.');
    expect(orden.notes).toMatch(
      /\[\d{4}-\d{2}-\d{2}\] Marta Mecánica: Probé compresión: cilindro 1 bajo\./,
    );
  });

  it('sin nota nueva no toca el historial', async () => {
    const { servicio, prisma } = construir(abierta);

    await servicio.advanceStatus('orden-1', WorkOrderStatus.IN_PROGRESS, '   ', MECANICO);

    expect(prisma.workOrder.update.mock.calls[0][0].data.notes).toBeUndefined();
  });

  it('no permite avanzar una orden ya cerrada', async () => {
    const { servicio } = construir({ ...abierta, status: WorkOrderStatus.CANCELLED });

    await expect(
      servicio.advanceStatus('orden-1', WorkOrderStatus.IN_PROGRESS, undefined, MECANICO),
    ).rejects.toThrow();
  });
});

describe('WorkOrdersService.assign', () => {
  it('asigna la orden a un mecánico activo', async () => {
    const { servicio } = construir({ ...abierta, assignedToId: null });

    const orden = await servicio.assign('orden-1', 'mec-1');
    expect(orden.assignedToId).toBe('mec-1');
  });

  it('rechaza asignar una orden cerrada', async () => {
    const { servicio } = construir({ ...abierta, status: WorkOrderStatus.COMPLETED });

    await expect(servicio.assign('orden-1', 'mec-1')).rejects.toThrow('cerrada');
  });

  it('rechaza asignar a quien no es mecánico', async () => {
    const { servicio } = construir(abierta, {
      usuario: { id: 'ins-1', role: UserRole.INSPECTOR, active: true },
    });

    await expect(servicio.assign('orden-1', 'ins-1')).rejects.toThrow('mecánico');
  });

  it('rechaza asignar a un mecánico desactivado', async () => {
    const { servicio } = construir(abierta, {
      usuario: { id: 'mec-9', role: UserRole.MECHANIC, active: false },
    });

    await expect(servicio.assign('orden-1', 'mec-9')).rejects.toThrow('desactivado');
  });

  it('rechaza asignar a un usuario que no existe', async () => {
    const { servicio } = construir(abierta, { usuario: null });

    await expect(servicio.assign('orden-1', 'nadie')).rejects.toThrow('no existe');
  });

  it('permite retirar la asignación', async () => {
    const { servicio, prisma } = construir(abierta);

    const orden = await servicio.assign('orden-1', null);

    expect(orden.assignedToId).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('WorkOrdersService.close', () => {
  it('sin autorización, recalcula el estado del vehículo desde su último escaneo', async () => {
    // Sin este recálculo, un vehículo reparado quedaría en rojo de forma
    // permanente: mientras hay órdenes abiertas el estado no puede bajar.
    const { servicio, vehicleStatus, prisma } = construir(abierta);

    const resultado = await servicio.close(
      'orden-1',
      WorkOrderStatus.COMPLETED,
      'Reparación verificada.',
      ADMIN,
    );

    expect(vehicleStatus.recomputeForVehicle).toHaveBeenCalledWith('veh-1');
    expect(resultado.vehicleStatus).toBe(VehicleStatus.CRITICAL);
    expect(resultado.operationAuthorized).toBe(false);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('con autorización, el vehículo vuelve a operativo', async () => {
    const { servicio, vehicleStatus, prisma } = construir(abierta);

    const resultado = await servicio.close(
      'orden-1',
      WorkOrderStatus.COMPLETED,
      'Reparación verificada en ruta.',
      ADMIN,
      true,
    );

    expect(resultado.vehicleStatus).toBe(VehicleStatus.OK);
    expect(resultado.operationAuthorized).toBe(true);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'veh-1' },
      data: { status: VehicleStatus.OK },
    });
    expect(vehicleStatus.recomputeForVehicle).not.toHaveBeenCalled();
    expect(resultado.orden.notes).toContain('Operación del vehículo autorizada');
  });

  it('la autorización no pone en verde un vehículo con otras órdenes abiertas', async () => {
    const { servicio, prisma } = construir(abierta, { otrasAbiertas: 1 });

    const resultado = await servicio.close(
      'orden-1',
      WorkOrderStatus.COMPLETED,
      'Reparado.',
      ADMIN,
      true,
    );

    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    expect(resultado.operationAuthorized).toBe(false);
  });

  it('un rol sin vehicle:authorize no puede autorizar la operación', async () => {
    const { servicio, prisma } = construir(abierta);

    await expect(
      servicio.close('orden-1', WorkOrderStatus.COMPLETED, 'Listo.', MECANICO, true),
    ).rejects.toThrow('no puede autorizar');
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('no se autoriza la operación al cancelar una orden', async () => {
    const { servicio } = construir(abierta);

    await expect(
      servicio.close('orden-1', WorkOrderStatus.CANCELLED, 'Duplicada.', ADMIN, true),
    ).rejects.toThrow('completar');
  });

  it('registra quién cerró y cuándo', async () => {
    const { servicio, prisma } = construir(abierta, {
      usuario: { name: 'Ana Admin' },
    });

    await servicio.close('orden-1', WorkOrderStatus.COMPLETED, 'Listo.', ADMIN);

    const data = prisma.workOrder.update.mock.calls[0][0].data;
    expect(data.closedById).toBe('admin-1');
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(data.notes).toContain('Cierre (COMPLETED) por Ana Admin: Listo.');
  });

  it('conserva las notas previas al cerrar', async () => {
    const { servicio } = construir(abierta);

    const { orden } = await servicio.close(
      'orden-1',
      WorkOrderStatus.COMPLETED,
      'Reparación verificada con escaneo posterior.',
      ADMIN,
    );

    expect(orden.notes).toContain('Cambié la bobina del cilindro 1.');
    expect(orden.notes).toContain('Reparación verificada con escaneo posterior.');
  });

  it('rechaza una nota de cierre vacía', async () => {
    const { servicio, prisma } = construir(abierta);

    await expect(
      servicio.close('orden-1', WorkOrderStatus.COMPLETED, '   ', ADMIN),
    ).rejects.toThrow('obligatoria');
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('rechaza cerrar una orden que ya está cerrada', async () => {
    const { servicio, vehicleStatus } = construir({
      ...abierta,
      status: WorkOrderStatus.COMPLETED,
    });

    await expect(
      servicio.close('orden-1', WorkOrderStatus.CANCELLED, 'x', ADMIN),
    ).rejects.toThrow();
    expect(vehicleStatus.recomputeForVehicle).not.toHaveBeenCalled();
  });
});

describe('WorkOrdersService.createManual (CU13, flujo alterno)', () => {
  const ACTOR = { sub: 'admin-1', role: UserRole.ADMIN };

  function construir(scan: any, ordenesAbiertas: any[] = []) {
    const prisma = {
      scan: { findUnique: jest.fn().mockResolvedValue(scan) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Ana' }) },
      vehicle: { update: jest.fn().mockResolvedValue({}) },
      workOrder: {
        findMany: jest.fn().mockResolvedValue(ordenesAbiertas),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'orden-manual', ...data })),
      },
    };
    return { servicio: new WorkOrdersService(prisma as any, {} as any), prisma };
  }

  const scanLeve = {
    id: 'scan-9',
    vehicleId: 'veh-1',
    severity: ScanSeverity.LOW,
    rationale: 'Un código pendiente aislado.',
    notes: null,
    workOrder: null,
    diagnosis: null,
    dtcEntries: [{ code: 'P0456' }],
    vehicle: { id: 'veh-1', plate: '4012-UAG', active: true, status: VehicleStatus.OK },
  };

  it('crea la orden con la evaluación automática como motivo y deja constancia del autor', async () => {
    const { servicio, prisma } = construir(scanLeve);

    const orden = await servicio.createManual('scan-9', undefined, ACTOR);

    expect(orden.priority).toBe(WorkOrderPriority.LOW);
    expect(orden.description).toContain('P0456');
    expect(orden.description).toContain('Un código pendiente aislado.');
    expect(orden.notes).toContain('creada a mano por Ana');
    // Con una orden abierta el vehículo ya no figura como operativo.
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'veh-1' },
      data: { status: VehicleStatus.ALERT },
    });
  });

  it('rechaza un escaneo que ya tiene orden', async () => {
    const { servicio, prisma } = construir({ ...scanLeve, workOrder: { id: 'otra' } });

    await expect(servicio.createManual('scan-9', undefined, ACTOR)).rejects.toThrow(
      /ya tiene una orden/,
    );
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
  });

  it('rechaza si el vehículo ya tiene una orden abierta', async () => {
    const { servicio, prisma } = construir(scanLeve, [{ id: 'abierta' }]);

    await expect(servicio.createManual('scan-9', undefined, ACTOR)).rejects.toThrow(
      /orden de trabajo abierta/,
    );
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
  });
});
