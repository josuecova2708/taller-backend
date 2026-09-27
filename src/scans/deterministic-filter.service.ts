import { Injectable } from '@nestjs/common';
import { DtcType, ScanSeverity, VehicleStatus } from '@prisma/client';
import { DtcItemDto, ReadinessStatusDto } from './dto/create-scan.dto';

export interface DeterministicEvaluationResult {
  severity: ScanSeverity;
  vehicleStatus: VehicleStatus;
  requiresAiEvaluation: boolean;
  recurrentCodes: string[];
  rationale: string;
  dtcDescriptions: Array<{
    code: string;
    type: DtcType;
    description: string;
    isRecurrent: boolean;
  }>;
}

export const STATIC_OBD_DICTIONARY: Record<string, string> = {
  P0300: 'Fallo de encendido aleatorio o en múltiples cilindros detectado',
  P0301: 'Fallo de encendido detectado en el cilindro 1',
  P0302: 'Fallo de encendido detectado en el cilindro 2',
  P0303: 'Fallo de encendido detectado en el cilindro 3',
  P0304: 'Fallo de encendido detectado en el cilindro 4',
  P0171: 'Sistema demasiado pobre (mezcla aire/combustible en Banco 1)',
  P0172: 'Sistema demasiado rico (mezcla aire/combustible en Banco 1)',
  P0420: 'Eficiencia del sistema catalizador por debajo del umbral (Banco 1)',
  P0455: 'Fuga grande detectada en el sistema de control de emisiones evaporativas (EVAP)',
  P0500: 'Fallo en el sensor de velocidad del vehículo (VSS)',
  P0562: 'Voltaje del sistema eléctrico bajo',
  P2195: 'Señal del sensor de oxígeno (A/F) atascada en mezcla pobre (Banco 1 Sensor 1)',
  P0115: 'Fallo en el circuito de temperatura del refrigerante del motor (ECT)',
  P0128: 'Temperatura del refrigerante por debajo de la temperatura reguladora del termostato',
  P0335: 'Fallo en el circuito del sensor de posición del cigüeñal (CKP)',
};

@Injectable()
export class DeterministicFilterService {
  getDtcDescription(code: string): string {
    const normalized = code.trim().toUpperCase();
    return (
      STATIC_OBD_DICTIONARY[normalized] ||
      'Código de diagnóstico OBD-II registrado en ECU (consultar manual de servicio)'
    );
  }

  evaluateScan(params: {
    dtcs: DtcItemDto[];
    readinessStatus?: ReadinessStatusDto;
    previousDtcCodes?: string[];
    batteryVoltage?: number;
  }): DeterministicEvaluationResult {
    const { dtcs, readinessStatus, previousDtcCodes = [], batteryVoltage } = params;

    const normalizedPrev = new Set(previousDtcCodes.map((c) => c.trim().toUpperCase()));
    const uniqueCurrentCodes = Array.from(
      new Set(dtcs.map((d) => d.code.trim().toUpperCase())),
    );
    const recurrentCodes = uniqueCurrentCodes.filter((code) => normalizedPrev.has(code));

    const dtcDescriptions = dtcs.map((d) => {
      const code = d.code.trim().toUpperCase();
      return {
        code,
        type: d.type,
        description: this.getDtcDescription(code),
        isRecurrent: normalizedPrev.has(code),
      };
    });

    const confirmed = dtcs.filter((d) => d.type === DtcType.CONFIRMED);
    const permanent = dtcs.filter((d) => d.type === DtcType.PERMANENT);
    const pending = dtcs.filter((d) => d.type === DtcType.PENDING);

    const monitorsCompleted = readinessStatus?.monitorsCompleted ?? true;
    const incompleteMonitors = readinessStatus?.incompleteMonitors ?? [];
    const lowBattery = batteryVoltage !== undefined && batteryVoltage > 0 && batteryVoltage < 11.8;

    // Regla 1: Códigos CONFIRMED (Mode 03) presentes -> Falla activa reportada por ECU
    if (confirmed.length > 0) {
      const isCritical = confirmed.length >= 2 || recurrentCodes.length > 0;
      return {
        severity: isCritical ? ScanSeverity.CRITICAL : ScanSeverity.HIGH,
        vehicleStatus: isCritical ? VehicleStatus.CRITICAL : VehicleStatus.ALERT,
        requiresAiEvaluation: true,
        recurrentCodes,
        rationale: isCritical
          ? `Se detectaron ${confirmed.length} código(s) CONFIRMADO(S) (Mode 03)${
              recurrentCodes.length > 0 ? ` con recurrencia histórica (${recurrentCodes.join(', ')})` : ''
            }. Se escala al asistente IA para generar hipótesis técnica y requiere revisión mecánica prioritaria antes de autorizar operación.`
          : `Se detectó código CONFIRMADO (${confirmed.map((c) => c.code).join(', ')}). Se escala al asistente IA para hipótesis técnica y evaluación por el responsable.`,
        dtcDescriptions,
      };
    }

    // Regla 2: Sin CONFIRMED, pero con códigos PERMANENT (Mode 0A)
    if (permanent.length > 0) {
      if (monitorsCompleted && recurrentCodes.length > 0) {
        return {
          severity: ScanSeverity.HIGH,
          vehicleStatus: VehicleStatus.CRITICAL,
          requiresAiEvaluation: true,
          recurrentCodes,
          rationale: `Código(s) PERMANENTE(S) (Mode 0A: ${permanent
            .map((p) => p.code)
            .join(', ')}) con monitores de preparación completos y recurrencia previa. Requiere evaluación técnica e hipótesis de IA.`,
          dtcDescriptions,
        };
      }

      if (!monitorsCompleted) {
        return {
          severity: ScanSeverity.MEDIUM,
          vehicleStatus: VehicleStatus.ALERT,
          requiresAiEvaluation: true,
          recurrentCodes,
          rationale: `Código(s) PERMANENTE(S) almacenado(s) con monitores OBD incompletos (${
            incompleteMonitors.join(', ') || 'en recalibración'
          }). Nota técnica: un código permanente puede permanecer tras una reparación hasta que la ECU complete sus ciclos de verificación. Se mantiene en seguimiento (ALERT) hasta completar monitores.`,
          dtcDescriptions,
        };
      }

      return {
        severity: ScanSeverity.MEDIUM,
        vehicleStatus: VehicleStatus.ALERT,
        requiresAiEvaluation: true,
        recurrentCodes,
        rationale: `Código(s) PERMANENTE(S) en historial de ECU (${permanent
          .map((p) => p.code)
          .join(', ')}). Requiere verificar si corresponde a una reparación reciente o falla intermitente.`,
        dtcDescriptions,
      };
    }

    // Regla 3: Solo códigos PENDING (Mode 07)
    if (pending.length > 0) {
      if (recurrentCodes.length > 0) {
        return {
          severity: ScanSeverity.MEDIUM,
          vehicleStatus: VehicleStatus.ALERT,
          requiresAiEvaluation: true,
          recurrentCodes,
          rationale: `Código(s) PENDIENTE(S) que reaparecen respecto al escaneo anterior (${recurrentCodes.join(
            ', ',
          )}). Se solicita hipótesis técnica por persistencia en ciclos consecutivos.`,
          dtcDescriptions,
        };
      }

      return {
        severity: ScanSeverity.LOW,
        vehicleStatus: VehicleStatus.ALERT,
        requiresAiEvaluation: false,
        recurrentCodes: [],
        rationale: !monitorsCompleted
          ? `Se registran código(s) PENDIENTE(S) (Mode 07: ${pending
              .map((p) => p.code)
              .join(', ')}) junto con monitores no completados (${
              incompleteMonitors.join(', ') || 'posible reseteo o desconexión de batería'
            }). No se clasifica automáticamente como OK ni como falla confirmada: requiere seguimiento y re-escaneo tras completar el ciclo de conducción.`
          : `Código(s) PENDIENTE(S) detectado(s) en un solo ciclo (${pending
              .map((p) => p.code)
              .join(', ')}). Se deja el vehículo en seguimiento (ALERT) para verificar si desaparece o se confirma en el próximo ciclo.`,
        dtcDescriptions,
      };
    }

    // Regla 4: Sin códigos DTC
    if (!monitorsCompleted) {
      return {
        severity: ScanSeverity.LOW,
        vehicleStatus: VehicleStatus.ALERT,
        requiresAiEvaluation: false,
        recurrentCodes: [],
        rationale: `Sin códigos DTC activos, pero los monitores de preparación OBD están incompletos (${
          incompleteMonitors.join(', ') || 'posible desconexión reciente de batería'
        }). Se recomienda re-escanear tras completar el ciclo de conducción antes de confirmar estado óptimo.`,
        dtcDescriptions: [],
      };
    }

    if (lowBattery) {
      return {
        severity: ScanSeverity.LOW,
        vehicleStatus: VehicleStatus.ALERT,
        requiresAiEvaluation: false,
        recurrentCodes: [],
        rationale: `Sin códigos DTC en motor, pero se detecta voltaje de batería bajo (${batteryVoltage}V). Verificar sistema de carga y estado de batería.`,
        dtcDescriptions: [],
      };
    }

    return {
      severity: ScanSeverity.NONE,
      vehicleStatus: VehicleStatus.OK,
      requiresAiEvaluation: false,
      recurrentCodes: [],
      rationale:
        'Escaneo sin códigos de falla (Modos 03/07/0A limpios) y monitores de preparación completados. Vehículo operativo.',
      dtcDescriptions: [],
    };
  }
}
