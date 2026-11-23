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

  // Reportes PDF
  REPORT_EXPORT: 'report:export',

  // Inventario de repuestos y catálogos de taller
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',

  // Bitácora de auditoría y notificaciones
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

/**
 * Matriz rol → permisos.
 *
 * Reparto de responsabilidades:
 *
 * - MECHANIC toma por su cuenta una orden sin asignar, la trabaja
 *   (`ORDER_UPDATE_STATUS`) y la cierra (`ORDER_CLOSE`). Solo puede cerrar la
 *   orden que tiene asignada: el servicio lo comprueba. Cerrarla como
 *   completada devuelve el vehículo a operativo, y queda registrado quién la
 *   cerró, cuándo y con qué justificación: esa es la trazabilidad de quién
 *   responde por la reparación.
 * - ADMIN conserva la asignación manual (`ORDER_ASSIGN`) para repartir o
 *   destrabar órdenes, y puede cerrar cualquiera.
 * - INSPECTOR escanea y puede leer la hipótesis de IA de sus escaneos
 *   (`DIAGNOSIS_READ`), pero no ve ni gestiona órdenes.
 *
 * Si la institución define un encargado de flota distinto del administrador,
 * se agrega `SUPERVISOR` al enum `UserRole` y una entrada aquí: ningún
 * controlador cambia.
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
    Permission.REPORT_EXPORT,
    Permission.INVENTORY_READ,
    Permission.INVENTORY_WRITE,
    Permission.AUDIT_READ,
  ],
  [UserRole.MECHANIC]: [
    Permission.VEHICLE_READ,
    Permission.SCAN_READ,
    Permission.SCAN_CREATE,
    Permission.DIAGNOSIS_READ,
    Permission.ORDER_READ,
    Permission.ORDER_UPDATE_STATUS,
    Permission.ORDER_CLOSE,
    Permission.REPORT_EXPORT,
    Permission.INVENTORY_READ,
  ],
  [UserRole.INSPECTOR]: [
    Permission.VEHICLE_READ,
    Permission.SCAN_READ,
    Permission.SCAN_CREATE,
    Permission.DIAGNOSIS_READ,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
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
