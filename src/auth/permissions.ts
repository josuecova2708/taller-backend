import { UserRole } from '@prisma/client';

/**
 * Catálogo de permisos del sistema.
 *
 * Los guards NUNCA preguntan por el rol directamente: preguntan por el permiso.
 * Esto permite reasignar atribuciones tras la entrevista con la institución
 * editando únicamente la matriz `ROLE_PERMISSIONS` de este archivo, sin tocar
 * controladores ni ejecutar migraciones.
 */
export const Permission = {
  // Administración de cuentas
  USER_MANAGE: 'user:manage',

  // Catálogo de vehículos
  VEHICLE_READ: 'vehicle:read',
  VEHICLE_WRITE: 'vehicle:write',

  // Escaneos OBD-II
  SCAN_READ: 'scan:read',
  SCAN_CREATE: 'scan:create',

  // Hipótesis técnicas asistidas por IA
  DIAGNOSIS_READ: 'diagnosis:read',

  // Órdenes de evaluación técnica
  ORDER_READ: 'order:read',
  ORDER_CREATE: 'order:create',
  ORDER_ASSIGN: 'order:assign',
  ORDER_UPDATE_STATUS: 'order:update_status',
  ORDER_CLOSE: 'order:close',

  // Decisión formal sobre la operación del vehículo (validación humana)
  VEHICLE_AUTHORIZE: 'vehicle:authorize',

  // Reportes PDF
  REPORT_EXPORT: 'report:export',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

/**
 * Matriz rol → permisos.
 *
 * Separación de deberes clave: MECHANIC puede AVANZAR una orden
 * (`ORDER_UPDATE_STATUS`) pero no CERRARLA (`ORDER_CLOSE`) ni autorizar la
 * operación del vehículo (`VEHICLE_AUTHORIZE`). Esa decisión formal queda
 * reservada, hoy, a ADMIN.
 *
 * Si la institución define un encargado de flota distinto del administrador,
 * agregar `SUPERVISOR` al enum `UserRole` y una entrada aquí con
 * ORDER_CLOSE + VEHICLE_AUTHORIZE: ningún controlador cambia.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionValue[]> = {
  [UserRole.ADMIN]: [
    Permission.USER_MANAGE,
    Permission.VEHICLE_READ,
    Permission.VEHICLE_WRITE,
    Permission.SCAN_READ,
    Permission.SCAN_CREATE,
    Permission.DIAGNOSIS_READ,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_ASSIGN,
    Permission.ORDER_UPDATE_STATUS,
    Permission.ORDER_CLOSE,
    Permission.VEHICLE_AUTHORIZE,
    Permission.REPORT_EXPORT,
  ],
  [UserRole.MECHANIC]: [
    Permission.VEHICLE_READ,
    Permission.SCAN_READ,
    Permission.SCAN_CREATE,
    Permission.DIAGNOSIS_READ,
    Permission.ORDER_READ,
    Permission.ORDER_UPDATE_STATUS,
    Permission.REPORT_EXPORT,
  ],
  [UserRole.INSPECTOR]: [
    Permission.VEHICLE_READ,
    Permission.SCAN_READ,
    Permission.SCAN_CREATE,
  ],
};

/**
 * Nombre visible de cada rol, separado del valor del enum.
 *
 * El enum es el identificador técnico estable; esta etiqueta es lo que ve el
 * usuario. Cuando la institución confirme su nomenclatura real (p. ej.
 * "Encargado de Movilidades" en lugar de "Inspector"), se cambia el string
 * aquí y no hay migración de base de datos.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.MECHANIC]: 'Mecánico',
  [UserRole.INSPECTOR]: 'Inspector',
};

export function permissionsForRole(role: UserRole): readonly PermissionValue[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: UserRole, permission: PermissionValue): boolean {
  return permissionsForRole(role).includes(permission);
}
