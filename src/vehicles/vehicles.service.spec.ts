// Mismo workaround que el resto de las suites: NestJS 12 es ESM y ts-jest
// corre en CommonJS.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Optional: () => () => {},
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { UserRole } from '@prisma/client';
import { VehiclesService } from './vehicles.service';

const INSPECTOR = { id: 'ins-1', role: UserRole.INSPECTOR, active: true };

function construir(usuario: any = INSPECTOR) {
  const prisma = {
    vehicle: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'v-1', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue(usuario) },
  };
  return { servicio: new VehiclesService(prisma as any), prisma };
}

describe('VehiclesService: responsable del vehículo', () => {
  it('registra un vehículo con un inspector activo como responsable', async () => {
    const { servicio, prisma } = construir();

    await servicio.create({ plate: ' 5521-tac ', responsibleId: 'ins-1' });

    expect(prisma.vehicle.create.mock.calls[0][0].data.responsibleId).toBe('ins-1');
  });

  it('sin responsable, el vehículo se registra igual', async () => {
    const { servicio, prisma } = construir();

    await servicio.create({ plate: '5521-TAC' });

    expect(prisma.vehicle.create.mock.calls[0][0].data.responsibleId).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza un responsable que no es inspector', async () => {
    const { servicio, prisma } = construir({ ...INSPECTOR, role: UserRole.MECHANIC });

    await expect(
      servicio.create({ plate: '5521-TAC', responsibleId: 'ins-1' }),
    ).rejects.toThrow('rol de inspector');
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it('rechaza un responsable desactivado', async () => {
    const { servicio } = construir({ ...INSPECTOR, active: false });

    await expect(
      servicio.create({ plate: '5521-TAC', responsibleId: 'ins-1' }),
    ).rejects.toThrow('desactivada');
  });

  it('rechaza un responsable que no existe', async () => {
    const { servicio } = construir(null);

    await expect(
      servicio.create({ plate: '5521-TAC', responsibleId: 'nadie' }),
    ).rejects.toThrow('no existe');
  });

  it('al editar, null quita el responsable sin validar a nadie', async () => {
    const { servicio, prisma } = construir();
    prisma.vehicle.findUnique.mockResolvedValueOnce({ id: 'v-1' }); // findOne

    await servicio.update('v-1', { responsibleId: null });

    expect(prisma.vehicle.update.mock.calls[0][0].data.responsibleId).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('al editar sin mencionar el responsable, no lo toca', async () => {
    const { servicio, prisma } = construir();
    prisma.vehicle.findUnique.mockResolvedValueOnce({ id: 'v-1' });

    await servicio.update('v-1', { alias: 'Camioneta' });

    expect('responsibleId' in prisma.vehicle.update.mock.calls[0][0].data).toBe(false);
  });

  it('al editar, valida al nuevo responsable', async () => {
    const { servicio, prisma } = construir({ ...INSPECTOR, role: UserRole.ADMIN });
    prisma.vehicle.findUnique.mockResolvedValueOnce({ id: 'v-1' });

    await expect(servicio.update('v-1', { responsibleId: 'adm-1' })).rejects.toThrow(
      'rol de inspector',
    );
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('?mine=true filtra por el responsable', async () => {
    const { servicio, prisma } = construir();

    await servicio.findAll(false, 'ins-1');

    expect(prisma.vehicle.findMany.mock.calls[0][0].where).toEqual({
      active: true,
      responsibleId: 'ins-1',
    });
    expect(prisma.vehicle.findMany.mock.calls[0][0].include.responsible).toBeDefined();
  });

  it('sin mine, devuelve toda la flota activa', async () => {
    const { servicio, prisma } = construir();

    await servicio.findAll();

    expect(prisma.vehicle.findMany.mock.calls[0][0].where).toEqual({ active: true });
  });
});
