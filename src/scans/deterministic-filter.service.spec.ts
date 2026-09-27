jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

import { DeterministicFilterService } from './deterministic-filter.service';
import { DtcType, ScanSeverity, VehicleStatus } from '@prisma/client';

describe('DeterministicFilterService', () => {
  let service: DeterministicFilterService;

  beforeEach(() => {
    service = new DeterministicFilterService();
  });

  it('Caso Tacoma: P0300 y P0301 CONFIRMED + recurrentes -> CRITICAL y requiere evaluación IA', () => {
    const result = service.evaluateScan({
      dtcs: [
        { code: 'P0300', type: DtcType.CONFIRMED },
        { code: 'P0301', type: DtcType.CONFIRMED },
      ],
      readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
      previousDtcCodes: ['P0300', 'P0301'],
      batteryVoltage: 13.3,
    });

    expect(result.severity).toBe(ScanSeverity.CRITICAL);
    expect(result.vehicleStatus).toBe(VehicleStatus.CRITICAL);
    expect(result.requiresAiEvaluation).toBe(true);
    expect(result.recurrentCodes).toEqual(['P0300', 'P0301']);
  });

  it('Caso Bus post-batería: P2195 PENDING con monitores incompletos -> seguimiento (ALERT / LOW), no marca OK automático ni invoca IA', () => {
    const result = service.evaluateScan({
      dtcs: [{ code: 'P2195', type: DtcType.PENDING }],
      readinessStatus: {
        monitorsCompleted: false,
        incompleteMonitors: ['Catalizador', 'Sensor de Oxígeno'],
        batteryResetSuspected: true,
      },
      previousDtcCodes: [],
      batteryVoltage: 12.6,
    });

    expect(result.severity).toBe(ScanSeverity.LOW);
    expect(result.vehicleStatus).toBe(VehicleStatus.ALERT);
    expect(result.requiresAiEvaluation).toBe(false);
    expect(result.rationale).toContain('monitores no completados');
  });

  it('Caso código PERMANENT con monitores incompletos -> advierte que puede ser residual post-reparación', () => {
    const result = service.evaluateScan({
      dtcs: [{ code: 'P0301', type: DtcType.PERMANENT }],
      readinessStatus: {
        monitorsCompleted: false,
        incompleteMonitors: ['Misfire', 'Catalizador'],
      },
      previousDtcCodes: [],
      batteryVoltage: 13.8,
    });

    expect(result.severity).toBe(ScanSeverity.MEDIUM);
    expect(result.vehicleStatus).toBe(VehicleStatus.ALERT);
    expect(result.rationale).toContain('puede permanecer tras una reparación');
  });

  it('Caso vehículo sin DTCs y monitores completos -> NONE y estado OK', () => {
    const result = service.evaluateScan({
      dtcs: [],
      readinessStatus: { monitorsCompleted: true, incompleteMonitors: [] },
      previousDtcCodes: [],
      batteryVoltage: 13.8,
    });

    expect(result.severity).toBe(ScanSeverity.NONE);
    expect(result.vehicleStatus).toBe(VehicleStatus.OK);
    expect(result.requiresAiEvaluation).toBe(false);
  });
});
