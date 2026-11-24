// ============================================================================
// Pruebas Unitarias Automatizadas basadas en Casos de Uso (CU)
// Proyecto: Sistema IoT de Diagnóstico Vehicular Preventivo OBD-II con IA (UAGRM)
// Mapeo directo para el documento de Taller de Grado (sección 3.5.4, Casos de Prueba)
// ============================================================================

// Mock de @nestjs/common para compatibilidad ts-jest en arquitectura ESM
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Optional: () => () => {},
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
  NotFoundException: class NotFoundException extends Error {},
  ConflictException: class ConflictException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
}));
jest.mock('./prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./obd/vehicle-status.service', () => ({ VehicleStatusService: class {} }));
jest.mock('./audit/audit.service', () => ({ AuditService: class {} }));
jest.mock('./diagnosis/diagnosis.service', () => ({
  DiagnosisService: class {},
  VENTANA_HISTORIAL: 3,
}));
jest.mock('./n8n/n8n.service', () => ({ N8nService: class {} }));
jest.mock('./push/push.service', () => ({ PushService: class {} }));

import {
  UserRole,
  ScanSeverity,
  VehicleStatus,
  WorkOrderPriority,
  DtcType,
} from '@prisma/client';

import { Permission, roleHasPermission } from './auth/permissions';
import { vinEnConflicto, normalizarVin } from './scans/vin-check';
import { DeterministicFilterService } from './obd/deterministic-filter.service';
import { DiagnosisHypothesisSchema } from './ai/diagnosis.schema';
import { prioridadDesdeSeveridad } from './work-orders/work-orders.service';
import { resolverEstadoVehiculo } from './scans/vehicle-status';
import { ScansService } from './scans/scans.service';

describe('3.5.4 Pruebas Unitarias de Casos de Uso (Backend)', () => {

  // --------------------------------------------------------------------------
  // CP-01 | CU02 / CU14 / CU07: Control de Acceso y Matriz de Permisos por Rol (RBAC)
  // --------------------------------------------------------------------------
  describe('CP-01 | CU02 / CU14 / CU07: Control de Acceso y Matriz de Permisos (RBAC)', () => {
    it('debe permitir la gestión de usuarios exclusivamente al rol ADMIN', () => {
      expect(roleHasPermission(UserRole.ADMIN, Permission.USER_MANAGE)).toBe(true);
      expect(roleHasPermission(UserRole.MECHANIC, Permission.USER_MANAGE)).toBe(false);
      expect(roleHasPermission(UserRole.INSPECTOR, Permission.USER_MANAGE)).toBe(false);
    });

    it('debe restringir la asignación manual de órdenes de trabajo al ADMIN', () => {
      expect(roleHasPermission(UserRole.ADMIN, Permission.ORDER_ASSIGN)).toBe(true);
      expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_ASSIGN)).toBe(false);
      expect(roleHasPermission(UserRole.INSPECTOR, Permission.ORDER_ASSIGN)).toBe(false);
    });

    it('debe permitir al MECHANIC actualizar y cerrar la orden asignada, pero no modificar vehículos', () => {
      expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_UPDATE_STATUS)).toBe(true);
      expect(roleHasPermission(UserRole.MECHANIC, Permission.ORDER_CLOSE)).toBe(true);
      expect(roleHasPermission(UserRole.MECHANIC, Permission.VEHICLE_WRITE)).toBe(false);
    });

    it('debe permitir al INSPECTOR registrar escaneos y consultar órdenes pero impedir que las cierre', () => {
      expect(roleHasPermission(UserRole.INSPECTOR, Permission.SCAN_CREATE)).toBe(true);
      expect(roleHasPermission(UserRole.INSPECTOR, Permission.ORDER_READ)).toBe(true);
      expect(roleHasPermission(UserRole.INSPECTOR, Permission.ORDER_CLOSE)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // CP-02 | CU03: Validación de Identidad Vehicular y Detección de Conflictos (VIN)
  // --------------------------------------------------------------------------
  describe('CP-02 | CU03: Validación de Identidad Vehicular y Detección de Conflictos', () => {
    it('debe normalizar cadenas de VIN a mayúsculas y sin espacios residuales', () => {
      expect(normalizarVin('  1hgcr2f83ha123456  ')).toBe('1HGCR2F83HA123456');
      expect(normalizarVin(null)).toBeNull();
      expect(normalizarVin('')).toBeNull();
    });

    it('debe detectar conflicto si el VIN de la ECU difiere del registrado en la flota', () => {
      const vinRegistrado = '1HGCR2F83HA123456';
      const vinLeidoEcu = '3VW2K7AJ4FM999999';

      const hayConflicto = vinEnConflicto(vinRegistrado, vinLeidoEcu);
      expect(hayConflicto).toBe(true);
    });

    it('no debe reportar conflicto cuando los VIN coinciden exactamente', () => {
      const vinRegistrado = '1HGCR2F83HA123456';
      const vinLeidoEcu = '1HGCR2F83HA123456';

      const hayConflicto = vinEnConflicto(vinRegistrado, vinLeidoEcu);
      expect(hayConflicto).toBe(false);
    });

    it('no debe reportar conflicto si la lectura es parcial (menos de 17 caracteres ISO)', () => {
      const vinRegistrado = '1HGCR2F83HA123456';
      const vinLecturaIncompleta = '1HGCR2F83';

      expect(vinEnConflicto(vinRegistrado, vinLecturaIncompleta)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // CP-03 | CU08: Clasificación Determinística de Escaneos y Semáforo de Salud
  // --------------------------------------------------------------------------
  describe('CP-03 | CU08: Clasificación de Escaneo y Semáforo de Salud', () => {
    let filterService: DeterministicFilterService;

    beforeEach(() => {
      filterService = new DeterministicFilterService();
    });

    it('debe calificar como CRITICAL y requerir IA ante códigos confirmados y recurrentes (P0300 y P0301)', () => {
      const resultado = filterService.evaluateScan({
        dtcs: [
          { code: 'P0300', type: DtcType.CONFIRMED },
          { code: 'P0301', type: DtcType.CONFIRMED },
        ],
        readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
        previousDtcCodes: ['P0300', 'P0301'],
        batteryVoltage: 13.5,
      });

      expect(resultado.severity).toBe(ScanSeverity.CRITICAL);
      expect(resultado.vehicleStatus).toBe(VehicleStatus.CRITICAL);
      expect(resultado.requiresAiEvaluation).toBe(true);
      expect(resultado.recurrentCodes).toContain('P0300');
    });

    it('debe calificar como ALERT (severidad LOW) ante fallas pendientes sin monitores completados', () => {
      const resultado = filterService.evaluateScan({
        dtcs: [{ code: 'P2195', type: DtcType.PENDING }],
        readinessStatus: {
          monitorsCompleted: false,
          incompleteMonitors: ['Sensor de Oxígeno'],
          batteryResetSuspected: true,
        },
        previousDtcCodes: [],
        batteryVoltage: 12.6,
      });

      expect(resultado.severity).toBe(ScanSeverity.LOW);
      expect(resultado.vehicleStatus).toBe(VehicleStatus.ALERT);
      expect(resultado.requiresAiEvaluation).toBe(false);
    });

    it('debe calificar como OK y sin necesidad de IA si el escaneo no arroja códigos DTC', () => {
      const resultado = filterService.evaluateScan({
        dtcs: [],
        readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
        previousDtcCodes: [],
        batteryVoltage: 13.8,
      });

      expect(resultado.severity).toBe(ScanSeverity.NONE);
      expect(resultado.vehicleStatus).toBe(VehicleStatus.OK);
      expect(resultado.requiresAiEvaluation).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // CP-04 | CU12: Validación Estructural de Hipótesis Técnica de IA (Claude API)
  // --------------------------------------------------------------------------
  describe('CP-04 | CU12: Validación Estructural de Hipótesis Técnica con IA', () => {
    it('debe validar satisfactoriamente un payload estructurado generado por Claude API', () => {
      const mockAiResponse = {
        summary:
          'Se detecta fallo de encendido en cilindro 1 consistente con bobina defectuosa o bujía desgastada.',
        severity: 'CRITICAL',
        probableCauses: [
          { cause: 'Bobina de encendido del cilindro 1 en corto intermitente', confidence: 'ALTA' },
          { cause: 'Bujía con carbonización excesiva', confidence: 'MEDIA' },
        ],
        verificationSteps: [
          'Medir resistencia de bobina de ignición en cilindro 1.',
          'Extraer e inspeccionar estado del electrodo de la bujía 1.',
        ],
        correlations: 'P0300 y P0301 comparten causa raíz en cilindro 1.',
      };

      const parsed = DiagnosisHypothesisSchema.safeParse(mockAiResponse);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.probableCauses.length).toBe(2);
        expect(parsed.data.severity).toBe('CRITICAL');
      }
    });

    it('debe rechazar una respuesta de IA que no incluya causas probables o falte severidad', () => {
      const respuestaInvalida = {
        summary: 'Resumen sin datos requeridos',
        probableCauses: [], // Schema exige .min(1)
      };

      const parsed = DiagnosisHypothesisSchema.safeParse(respuestaInvalida);
      expect(parsed.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // CP-05 | CU15 / CU16: Ciclo de Vida y Transición de Órdenes de Trabajo
  // --------------------------------------------------------------------------
  describe('CP-05 | CU15 / CU16: Ciclo de Vida y Transición de Órdenes de Trabajo', () => {
    it('debe mapear directamente la severidad del escaneo a la prioridad de la orden', () => {
      expect(prioridadDesdeSeveridad(ScanSeverity.NONE)).toBe(WorkOrderPriority.LOW);
      expect(prioridadDesdeSeveridad(ScanSeverity.LOW)).toBe(WorkOrderPriority.LOW);
      expect(prioridadDesdeSeveridad(ScanSeverity.MEDIUM)).toBe(WorkOrderPriority.MEDIUM);
      expect(prioridadDesdeSeveridad(ScanSeverity.HIGH)).toBe(WorkOrderPriority.HIGH);
      expect(prioridadDesdeSeveridad(ScanSeverity.CRITICAL)).toBe(WorkOrderPriority.CRITICAL);
    });

    it('no debe permitir que un escaneo limpio degrade el estado del vehículo a OK si hay orden abierta', () => {
      // Si el vehículo tiene orden abierta en CRITICAL, un escaneo limpio (calculado OK)
      // debe preservar CRITICAL hasta que un humano cierre la orden.
      const estadoPreservado = resolverEstadoVehiculo(
        VehicleStatus.OK,
        VehicleStatus.CRITICAL,
        true, // tieneOrdenesAbiertas = true
      );

      expect(estadoPreservado).toBe(VehicleStatus.CRITICAL);
    });

    it('debe permitir que el vehículo regrese a OK si no existen órdenes de trabajo abiertas', () => {
      const estadoActualizado = resolverEstadoVehiculo(
        VehicleStatus.OK,
        VehicleStatus.CRITICAL,
        false, // tieneOrdenesAbiertas = false
      );

      expect(estadoActualizado).toBe(VehicleStatus.OK);
    });
  });

  // --------------------------------------------------------------------------
  // 9.3.1. Pruebas de caja negra — CU06: Ejecutar Escaneo OBD-II
  // --------------------------------------------------------------------------
  describe('Prueba de caja negra | CU06: Ejecutar Escaneo OBD-II', () => {
    it('Prueba de CU06 Ejecutar Escaneo OBD-II: procesa la trama obtenida del ELM327 (VIN, voltaje, protocolo CAN, monitores y DTCs) y devuelve el resultado del escaneo', async () => {
      // Precondición: El inspector autenticado seleccionó el vehículo 5521-TAC
      // y ejecutó la secuencia de interrogación OBD-II con el adaptador ELM327.
      const vehiculoRegistrado = {
        id: 'veh-tacoma-5521',
        plate: '5521-TAC',
        vin: '5TFCZ5AN3MX255216',
        active: true,
        status: VehicleStatus.OK,
      };

      const prismaMock = {
        vehicle: {
          findUnique: jest.fn().mockResolvedValue(vehiculoRegistrado),
          update: jest.fn().mockResolvedValue({
            ...vehiculoRegistrado,
            status: VehicleStatus.CRITICAL,
          }),
        },
        scan: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({
              id: 'scan-cu06-001',
              ...data,
              vehicle: vehiculoRegistrado,
              dtcEntries: [
                { id: 'dtc-1', code: 'P0300', type: DtcType.CONFIRMED },
                { id: 'dtc-2', code: 'P0301', type: DtcType.CONFIRMED },
                { id: 'dtc-3', code: 'P0300', type: DtcType.PERMANENT },
                { id: 'dtc-4', code: 'P0301', type: DtcType.PERMANENT },
              ],
            }),
          ),
        },
        workOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      const filterService = new DeterministicFilterService();
      const diagnosisMock = { processScan: jest.fn().mockResolvedValue(undefined) };
      const workOrdersMock = {
        createOrUpdateForScan: jest.fn().mockResolvedValue({
          orden: { id: 'wo-cu06-001' },
          creada: true,
        }),
        countOpenByVehicle: jest.fn().mockResolvedValue(1),
      };
      const n8nMock = { notificarAlerta: jest.fn().mockResolvedValue(undefined) };
      const pushMock = { notificarOrden: jest.fn().mockResolvedValue(undefined) };

      const scansService = new ScansService(
        prismaMock as any,
        filterService,
        diagnosisMock as any,
        workOrdersMock as any,
        n8nMock as any,
        pushMock as any,
      );

      // Entrada: Trama estructurada producto de la ejecución del escaneo OBD-II
      // (ATZ, ATE0, ATSP0, 0100, ATDPN -> ISO 15765-4 CAN, ATRV -> 13.3V,
      //  0902 -> VIN, 0101 -> Readiness, Modos 03/07/0A -> P0300 y P0301).
      const entradaEscaneoObd = {
        vehicleId: 'veh-tacoma-5521',
        vin: '5TFCZ5AN3MX255216',
        batteryVoltage: 13.3,
        complete: true,
        protocol: {
          number: '6',
          automatic: true,
          isCan: true,
          label: 'ISO 15765-4 CAN (11 bit, 500 kbaud)',
          raw: 'A6',
        },
        readinessStatus: {
          milOn: true,
          dtcCount: 2,
          monitorsCompleted: true,
          incompleteMonitors: [],
          compressionIgnition: false,
          rawHex: '41 01 82 07 65 00',
        },
        dtcs: [
          { code: 'P0300', type: DtcType.CONFIRMED },
          { code: 'P0301', type: DtcType.CONFIRMED },
          { code: 'P0300', type: DtcType.PERMANENT },
          { code: 'P0301', type: DtcType.PERMANENT },
        ],
      };

      // Condición de ejecución: Se procesa el escaneo ejecutado por el inspector.
      const resultado = await scansService.create(
        entradaEscaneoObd as any,
        'inspector-fca-001',
      );

      // Resultado Esperado / Obtenido:
      expect(resultado.scan.id).toBe('scan-cu06-001');
      expect(resultado.scan.batteryVoltage).toBe(13.3);
      expect(resultado.scan.dtcEntries).toHaveLength(4);
      expect(resultado.evaluation.severity).toBe(ScanSeverity.CRITICAL);
      expect(resultado.scan.vehicle.status).toBe(VehicleStatus.CRITICAL);
      expect(resultado.workOrderId).toBe('wo-cu06-001');
    });
  });
});
