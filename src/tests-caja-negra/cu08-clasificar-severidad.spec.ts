// ============================================================================
// 9.3.1. Pruebas de caja negra — CU08. Clasificar Severidad del Escaneo
// ============================================================================

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

import { DtcType, ScanSeverity, VehicleStatus } from '@prisma/client';
import { DeterministicFilterService } from '../obd/deterministic-filter.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU08. Clasificar Severidad del Escaneo', () => {
    it('Prueba de CU08 Clasificar Severidad del Escaneo', () => {
      const filterService = new DeterministicFilterService();

      // Entrada: Códigos confirmados P0300 y P0301 con recurrencia en el historial
      // y monitores de preparación completos.
      const entradaEscaneo = {
        dtcs: [
          { code: 'P0300', type: DtcType.CONFIRMED },
          { code: 'P0301', type: DtcType.CONFIRMED },
        ],
        readinessStatus: {
          milOn: true,
          dtcCount: 2,
          monitorsCompleted: true,
          incompleteMonitors: [],
        },
        previousDtcCodes: ['P0300'],
        batteryVoltage: 13.3,
      };

      // Condición de ejecución: Evaluación automática por el filtro determinístico
      const dictamen = filterService.evaluateScan(entradaEscaneo);

      // Resultado Esperado / Obtenido
      expect(dictamen.severity).toBe(ScanSeverity.CRITICAL);
      expect(dictamen.vehicleStatus).toBe(VehicleStatus.CRITICAL);
      expect(dictamen.requiresAiEvaluation).toBe(true);
      expect(dictamen.recurrentCodes).toContain('P0300');
    });
  });
});
