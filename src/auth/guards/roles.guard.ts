import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard de rol explícito. Mecanismo secundario: la autorización del sistema se
 * expresa con `@RequirePermission()` sobre la matriz de `permissions.ts`.
 *
 * Se conserva para chequeos gruesos y FALLA CERRADO: un `@Roles()` sin
 * argumentos deniega el acceso en lugar de permitirlo.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin metadata: el endpoint no usa este mecanismo.
    if (requiredRoles === undefined) {
      return true;
    }

    // Con metadata vacía: declaración incompleta. Denegar, nunca permitir.
    if (requiredRoles.length === 0) {
      throw new ForbiddenException(
        '@Roles() fue declarado sin roles: acceso denegado por configuración incompleta.',
      );
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) {
      throw new ForbiddenException('Token sin rol asociado.');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Acceso restringido a: ${requiredRoles.join(', ')}.`);
    }

    return true;
  }
}
