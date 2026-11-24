// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU08. Clasificar Severidad del Escaneo
// Método evaluado: DeterministicFilterService.evaluateScan(params)
// Complejidad Ciclomática V(G) = 4 + 1 = 5 caminos independientes
// ============================================================================

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

import { DtcType, ScanSeverity, VehicleStatus } from '@prisma/client';
import { DeterministicFilterService } from '../obd/deterministic-filter.service';

describe('9.3.2. Pruebas de caja blanca — CU08. Clasificar Severidad del Escaneo', () => {
  const filterService = new DeterministicFilterService();

  it('Camino 1 (1,2,3,11): clasifica como CRITICAL / HIGH y requiere IA cuando existen códigos CONFIRMED (Modo 03)', () => {
    const dictamen = filterService.evaluateScan({
      dtcs: [
        { code: 'P0300', type: DtcType.CONFIRMED },
        { code: 'P0301', type: DtcType.CONFIRMED },
      ],
      readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
      previousDtcCodes: ['P0300'],
      batteryVoltage: 13.3,
    });

    expect(dictamen.severity).toBe(ScanSeverity.CRITICAL);
    expect(dictamen.vehicleStatus).toBe(VehicleStatus.CRITICAL);
    expect(dictamen.requiresAiEvaluation).toBe(true);
  });

  it('Camino 2 (1,2,4,5,11): clasifica como MEDIUM / HIGH y requiere IA cuando existen códigos PERMANENT (Modo 0A) sin confirmados', () => {
    const dictamen = filterService.evaluateScan({
      dtcs: [{ code: 'P0420', type: DtcType.PERMANENT }],
      readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
      previousDtcCodes: [],
      batteryVoltage: 13.4,
    });

    expect(dictamen.severity).toBe(ScanSeverity.MEDIUM);
    expect(dictamen.vehicleStatus).toBe(VehicleStatus.ALERT);
    expect(dictamen.requiresAiEvaluation).toBe(true);
  });

  it('Camino 3 (1,2,4,6,7,11): clasifica como LOW (o MEDIUM si es recurrente) cuando solo existen códigos PENDING (Modo 07)', () => {
    const dictamen = filterService.evaluateScan({
      dtcs: [{ code: 'P0456', type: DtcType.PENDING }],
      readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
      previousDtcCodes: [],
      batteryVoltage: 13.4,
    });

    expect(dictamen.severity).toBe(ScanSeverity.LOW);
    expect(dictamen.vehicleStatus).toBe(VehicleStatus.ALERT);
    expect(dictamen.requiresAiEvaluation).toBe(false);
  });

  it('Camino 4 (1,2,4,6,8,9,11): clasifica como LOW (ALERT) sin códigos DTC cuando hay monitores incompletos o batería baja (<11.8 V)', () => {
    const dictamen = filterService.evaluateScan({
      dtcs: [],
      readinessStatus: {
        monitorsCompleted: false,
        incompleteMonitors: ['Catalizador'],
      },
      previousDtcCodes: [],
      batteryVoltage: 11.4,
    });

    expect(dictamen.severity).toBe(ScanSeverity.LOW);
    expect(dictamen.vehicleStatus).toBe(VehicleStatus.ALERT);
    expect(dictamen.requiresAiEvaluation).toBe(false);
  });

  it('Camino 5 (1,2,4,6,8,10,11): clasifica como NONE (OK) sin evaluación IA cuando no hay DTCs, monitores completos y batería normal', () => {
    const dictamen = filterService.evaluateScan({
      dtcs: [],
      readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
      previousDtcCodes: [],
      batteryVoltage: 13.6,
    });

    expect(dictamen.severity).toBe(ScanSeverity.NONE);
    expect(dictamen.vehicleStatus).toBe(VehicleStatus.OK);
    expect(dictamen.requiresAiEvaluation).toBe(false);
  });
});
