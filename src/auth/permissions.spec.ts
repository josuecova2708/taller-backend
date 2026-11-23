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

  it('permite al MECHANIC avanzar y cerrar una orden, pero no asignarla', () => {
    // El mecánico toma la orden por su cuenta y la cierra; la asignación
    // manual sigue siendo del administrador.
    expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_UPDATE_STATUS)).toBe(true);
    expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_CLOSE)).toBe(true);
    expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_ASSIGN)).toBe(false);
  });

  it('reserva la asignación manual de órdenes al ADMIN', () => {
    const asignan = Object.values(UserRole).filter((role) =>
      roleHasPermission(role, Permission.ORDER_ASSIGN),
    );
    expect(asignan).toEqual([UserRole.ADMIN]);
  });

  it('el INSPECTOR lee la hipótesis de IA y puede consultar y crear órdenes, pero no cerrarlas', () => {
    expect(roleHasPermission(UserRole.INSPECTOR, Permission.DIAGNOSIS_READ)).toBe(true);
    expect(roleHasPermission(UserRole.INSPECTOR, Permission.ORDER_READ)).toBe(true);
    expect(roleHasPermission(UserRole.INSPECTOR, Permission.ORDER_CREATE)).toBe(true);
    expect(roleHasPermission(UserRole.INSPECTOR, Permission.ORDER_CLOSE)).toBe(false);
  });

  it('ya no existe un permiso de autorización separado del cierre', () => {
    expect(Object.values(Permission)).not.toContain('vehicle:authorize');
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
