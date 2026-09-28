import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { PermissionValue, ROLE_LABELS, permissionsForRole } from '../permissions';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard global de autorización, evaluado después del `JwtAuthGuard`.
 *
 * Falla cerrado: si el endpoint declara permisos y el request no trae un
 * usuario con rol resoluble, se rechaza.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<PermissionValue[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Endpoint autenticado que no declara permisos: basta con el token válido.
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) {
      throw new UnauthorizedException('Token sin rol asociado. Vuelva a iniciar sesión.');
    }

    const granted = permissionsForRole(user.role as UserRole);
    const missing = required.filter((permission) => !granted.includes(permission));

    if (missing.length > 0) {
      const label = ROLE_LABELS[user.role as UserRole] ?? user.role;
      throw new ForbiddenException(
        `El rol ${label} no tiene permiso para esta operación (requiere: ${missing.join(', ')}).`,
      );
    }

    return true;
  }
}
