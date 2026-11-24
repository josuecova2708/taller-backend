// ============================================================================
// 9.3.1. Pruebas de caja negra — CU01. Iniciar y Cerrar Sesión
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

import { UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU01. Iniciar y Cerrar Sesión', () => {
    it('Prueba de CU01 Iniciar y Cerrar Sesión', async () => {
      // Precondición: El usuario se encuentra registrado y activo en el sistema.
      const usuarioRegistrado = {
        id: 'usr-insp-001',
        email: 'inspector.ficct@uagrm.edu.bo',
        name: 'Valeria Suárez (Inspectora FICCT)',
        role: UserRole.INSPECTOR,
        unitId: 'unit-ficct',
        active: true,
        passwordHash: 'hash(taller123)',
      };

      const prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue(usuarioRegistrado),
        },
      };
      const jwtMock = {
        sign: jest.fn().mockReturnValue('jwt.token.institucional.uagrm'),
      };

      const authService = new AuthService(prismaMock as any, jwtMock as any);

      // Condición de ejecución: Envío de credenciales institucionales a POST /api/auth/login
      const sesion = await authService.login({
        email: 'inspector.ficct@uagrm.edu.bo',
        password: 'taller123',
      });

      // Resultado Esperado / Obtenido
      expect(sesion.accessToken).toBe('jwt.token.institucional.uagrm');
      expect(sesion.user.email).toBe('inspector.ficct@uagrm.edu.bo');
      expect(sesion.user.role).toBe(UserRole.INSPECTOR);
      expect(sesion.user.permissions).toContain('scan:create');
    });
  });
});
