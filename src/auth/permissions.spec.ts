import { UserRole } from '@prisma/client';
import {
  Permission,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
} from './permissions';

describe('Matriz de permisos por rol', () => {
  it('define permisos y etiqueta visible para todos los roles del enum', () => {
    for (const role of Object.values(UserRole)) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it('reserva la administración de cuentas al ADMIN', () => {
    expect(roleHasPermission(UserRole.ADMIN, Permission.USER_MANAGE)).toBe(true);
    expect(roleHasPermission(UserRole.MECHANIC, Permission.USER_MANAGE)).toBe(false);
    expect(roleHasPermission(UserRole.INSPECTOR, Permission.USER_MANAGE)).toBe(false);
  });

  it('permite al MECHANIC avanzar una orden pero no cerrarla', () => {
    expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_UPDATE_STATUS)).toBe(true);
    expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_CLOSE)).toBe(false);
  });

  it('reserva la autorización de operación del vehículo (validación humana)', () => {
    // El sistema presenta hipótesis; autorizar la operación es decisión humana
    // y queda restringida a un rol con responsabilidad formal.
    const autorizados = Object.values(UserRole).filter((role) =>
      roleHasPermission(role, Permission.VEHICLE_AUTHORIZE),
    );
    expect(autorizados).toEqual([UserRole.ADMIN]);
  });

  it('impide al INSPECTOR modificar el catálogo de vehículos', () => {
    expect(roleHasPermission(UserRole.INSPECTOR, Permission.VEHICLE_READ)).toBe(true);
    expect(roleHasPermission(UserRole.INSPECTOR, Permission.VEHICLE_WRITE)).toBe(false);
  });

  it('habilita la creación de escaneos a los tres roles operativos', () => {
    for (const role of Object.values(UserRole)) {
      expect(roleHasPermission(role, Permission.SCAN_CREATE)).toBe(true);
    }
  });

  it('no otorga permisos a un rol desconocido', () => {
    expect(permissionsForRole('SUPERVISOR' as UserRole)).toEqual([]);
  });
});
