// Mismo workaround que el resto de las suites: NestJS 12 es ESM y ts-jest
// corre en CommonJS.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
  UnauthorizedException: class UnauthorizedException extends Error {},
}));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('bcrypt', () => ({
  hash: jest.fn(async (texto: string) => `hash(${texto})`),
  compare: jest.fn(async (texto: string, hash: string) => hash === `hash(${texto})`),
}));

import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

const ADMIN = {
  id: 'admin-1',
  email: 'admin@uagrm.edu.bo',
  name: 'Ana',
  role: UserRole.ADMIN,
  active: true,
  passwordHash: 'hash(secreta)',
};
const MECANICO = {
  id: 'mec-1',
  email: 'mecanico@uagrm.edu.bo',
  name: 'Marta',
  role: UserRole.MECHANIC,
  active: true,
  passwordHash: 'hash(secreta)',
};

function construir(ordenesAbiertas = 0) {
  const usuarios = [ADMIN, MECANICO];
  const prisma = {
    user: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          usuarios.find((u) => u.id === where.id || u.email === where.email) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => ({
        ...usuarios.find((u) => u.id === where.id),
        ...data,
      })),
    },
    workOrder: { count: jest.fn().mockResolvedValue(ordenesAbiertas) },
    vehicle: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const jwt = { sign: jest.fn().mockReturnValue('token') };
  return { servicio: new AuthService(prisma as any, jwt as any), prisma };
}

describe('AuthService: gestión de usuarios (CU02)', () => {
  it('desactiva una cuenta sin borrarla', async () => {
    const { servicio, prisma } = construir();
    const resultado = await servicio.setUserActive(MECANICO.id, false, ADMIN.id);

    expect(resultado.active).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MECANICO.id }, data: { active: false } }),
    );
  });

  it('al desactivar una cuenta, sus vehículos quedan sin responsable', async () => {
    const { servicio, prisma } = construir();
    await servicio.setUserActive(MECANICO.id, false, ADMIN.id);

    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: { responsibleId: MECANICO.id },
      data: { responsibleId: null },
    });
  });

  it('al reactivar una cuenta no toca los vehículos', async () => {
    const { servicio, prisma } = construir();
    await servicio.setUserActive(MECANICO.id, true, ADMIN.id);

    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('si un inspector deja de serlo, sus vehículos quedan sin responsable', async () => {
    const { servicio, prisma } = construir();
    prisma.user.findUnique.mockResolvedValueOnce({
      ...MECANICO,
      id: 'ins-1',
      role: UserRole.INSPECTOR as any,
    });

    await servicio.updateUser('ins-1', { role: UserRole.MECHANIC }, ADMIN.id);

    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: { responsibleId: 'ins-1' },
      data: { responsibleId: null },
    });
  });

  it('no deja que alguien desactive su propia cuenta', async () => {
    const { servicio, prisma } = construir();
    await expect(servicio.setUserActive(ADMIN.id, false, ADMIN.id)).rejects.toThrow(
      /propia cuenta/,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('no desactiva a un mecánico con órdenes abiertas asignadas', async () => {
    const { servicio, prisma } = construir(2);
    await expect(
      servicio.setUserActive(MECANICO.id, false, ADMIN.id),
    ).rejects.toThrow(/2 órdenes de trabajo abiertas/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('no deja que alguien cambie su propio rol', async () => {
    const { servicio } = construir();
    await expect(
      servicio.updateUser(ADMIN.id, { role: UserRole.INSPECTOR }, ADMIN.id),
    ).rejects.toThrow(/propio rol/);
  });

  it('rechaza un correo que ya usa otra cuenta', async () => {
    const { servicio } = construir();
    await expect(
      servicio.updateUser(MECANICO.id, { email: ' ADMIN@uagrm.edu.bo ' }, ADMIN.id),
    ).rejects.toThrow(/Ya existe una cuenta/);
  });

  it('edita nombre y rol de otra cuenta', async () => {
    const { servicio } = construir();
    const resultado = await servicio.updateUser(
      MECANICO.id,
      { name: '  Marta Rojas ', role: UserRole.INSPECTOR },
      ADMIN.id,
    );
    expect(resultado.name).toBe('Marta Rojas');
    expect(resultado.roleLabel).toBe('Inspector');
  });

  it('restablece la contraseña guardando solo el hash', async () => {
    const { servicio, prisma } = construir();
    await servicio.resetPassword(MECANICO.id, 'nueva-clave');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: MECANICO.id },
      data: { passwordHash: 'hash(nueva-clave)' },
    });
  });

  it('una cuenta desactivada no puede iniciar sesión', async () => {
    const { servicio, prisma } = construir();
    prisma.user.findUnique.mockResolvedValueOnce({ ...MECANICO, active: false });
    await expect(
      servicio.login({ email: MECANICO.email, password: 'secreta' }),
    ).rejects.toThrow(/desactivada/);
  });

  it('avisa si el usuario no existe', async () => {
    const { servicio } = construir();
    await expect(servicio.resetPassword('no-existe', 'clave-nueva')).rejects.toThrow(
      /no existe/,
    );
  });
});
