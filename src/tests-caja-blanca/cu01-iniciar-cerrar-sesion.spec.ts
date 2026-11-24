// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU01. Iniciar y Cerrar Sesión
// Método evaluado: AuthService.login(dto: LoginDto)
// Complejidad Ciclomática V(G) = 3 + 1 = 4 caminos independientes
// ============================================================================

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Optional: () => () => {},
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
  UnauthorizedException: class UnauthorizedException extends Error {},
}));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('bcrypt', () => ({
  hash: jest.fn(async (t: string) => `hash(${t})`),
  compare: jest.fn(async (t: string, h: string) => h === `hash(${t})`),
}));

import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';

describe('9.3.2. Pruebas de caja blanca — CU01. Iniciar y Cerrar Sesión', () => {
  const usuarioBase = {
    id: 'usr-insp-001',
    email: 'inspector.ficct@uagrm.edu.bo',
    name: 'Valeria Suárez (Inspectora FICCT)',
    role: UserRole.INSPECTOR,
    unitId: 'unit-ficct',
    active: true,
    passwordHash: 'hash(taller123)',
  };

  function crearServicio(userMock: any, auditMock?: any) {
    const prismaMock = {
      user: { findUnique: jest.fn().mockResolvedValue(userMock) },
    };
    const jwtMock = {
      sign: jest.fn().mockReturnValue('jwt.token.institucional.uagrm'),
    };
    return {
      authService: new AuthService(prismaMock as any, jwtMock as any, auditMock),
      prismaMock,
      jwtMock,
    };
  }

  it('Camino 1 (1,2,3,9): lanza UnauthorizedException cuando el correo no existe (!user)', async () => {
    const { authService } = crearServicio(null);

    await expect(
      authService.login({
        email: 'inexistente@uagrm.edu.bo',
        password: 'taller123',
      }),
    ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas'));
  });

  it('Camino 2 (1,2,4,5,9): lanza UnauthorizedException cuando la contraseña no coincide (!isPasswordValid)', async () => {
    const { authService } = crearServicio(usuarioBase);

    await expect(
      authService.login({
        email: 'inspector.ficct@uagrm.edu.bo',
        password: 'clave-incorrecta',
      }),
    ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas'));
  });

  it('Camino 3 (1,2,4,6,7,9): lanza UnauthorizedException cuando la cuenta está desactivada (!user.active)', async () => {
    const { authService } = crearServicio({ ...usuarioBase, active: false });

    await expect(
      authService.login({
        email: 'inspector.ficct@uagrm.edu.bo',
        password: 'taller123',
      }),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Su cuenta está desactivada. Contacte al administrador.',
      ),
    );
  });

  it('Camino 4 (1,2,4,6,8,9): registra LOGIN en auditoría y retorna accessToken JWT y sesión del usuario', async () => {
    const auditMock = { record: jest.fn() };
    const { authService } = crearServicio(usuarioBase, auditMock);

    const sesion = await authService.login({
      email: '  INSPECTOR.FICCT@uagrm.edu.bo ',
      password: 'taller123',
    });

    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN', entity: 'USER' }),
    );
    expect(sesion.accessToken).toBe('jwt.token.institucional.uagrm');
    expect(sesion.user.email).toBe('inspector.ficct@uagrm.edu.bo');
    expect(sesion.user.role).toBe(UserRole.INSPECTOR);
    expect(sesion.user.permissions).toContain('scan:create');
  });
});
