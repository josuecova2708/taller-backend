// ============================================================================
// 9.3.1. Pruebas de caja negra — CU06. Ejecutar Escaneo OBD-II
// ============================================================================

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

import { DtcType, ScanSeverity, VehicleStatus } from '@prisma/client';
import { DeterministicFilterService } from '../obd/deterministic-filter.service';

describe('9.3.1. Pruebas de caja negra', () => {
  describe('CU06. Ejecutar Escaneo OBD-II', () => {
    it('Prueba de CU06 Ejecutar Escaneo OBD-II', () => {
      const filterService = new DeterministicFilterService();

      // Entrada: Trama OBD-II leída de la ECU mediante el adaptador ELM327
      // (Protocolo ISO 15765-4 CAN, voltaje 13.3 V, monitores completos y DTCs P0300 / P0301)
      const lecturaObd = {
        vin: '5TFCZ5AN3MX255216',
        batteryVoltage: 13.3,
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
        },
        dtcs: [
          { code: 'P0300', type: DtcType.CONFIRMED },
          { code: 'P0301', type: DtcType.CONFIRMED },
        ],
      };

      // Condición de ejecución: Se evalúa la lectura obtenida del adaptador ELM327
      const resultado = filterService.evaluateScan({
        dtcs: lecturaObd.dtcs,
        readinessStatus: lecturaObd.readinessStatus,
        previousDtcCodes: [],
        batteryVoltage: lecturaObd.batteryVoltage,
      });

      // Resultado Esperado / Obtenido
      expect(lecturaObd.protocol.isCan).toBe(true);
      expect(lecturaObd.batteryVoltage).toBe(13.3);
      expect(lecturaObd.readinessStatus.monitorsCompleted).toBe(true);
      expect(lecturaObd.dtcs).toHaveLength(2);
      expect(resultado.severity).toBe(ScanSeverity.CRITICAL);
      expect(resultado.vehicleStatus).toBe(VehicleStatus.CRITICAL);
    });
  });
});
