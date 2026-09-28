import { SetMetadata } from '@nestjs/common';
import { PermissionValue } from '../permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Exige uno o más permisos para acceder al endpoint.
 *
 * Cuando se declaran varios, se exigen TODOS (AND).
 */
export const RequirePermission = (...permissions: PermissionValue[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
