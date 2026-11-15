import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
  IsObject,
  IsBoolean,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DtcType } from '@prisma/client';

export class DtcItemDto {
  @IsString()
  @Matches(/^[PCBU][0-9A-F]{4}$/i, {
    message: 'El código DTC debe tener el formato estándar OBD-II (ej. P0300, P2195)',
  })
  code: string;

  @IsEnum(DtcType)
  type: DtcType;
}

/**
 * Estado global de monitores de preparación (Mode 01 PID 01).
 *
 * Los campos llevan validador de tipo además de `@IsOptional()`: antes
 * `@IsOptional()` sin validador aceptaba cualquier cosa, de modo que
 * `milOn: "banana"` pasaba la validación y se persistía.
 */
export class ReadinessStatusDto {
  @IsOptional()
  @IsBoolean()
  milOn?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(127)
  dtcCount?: number;

  @IsOptional()
  @IsBoolean()
  monitorsCompleted?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  incompleteMonitors?: string[];

  /**
   * Motor de encendido por compresión (diésel), del byte B bit 3.
   *
   * Determina qué sistemas designan los bits del byte D, y por lo tanto
   * cambia por completo qué monitores se reportan como incompletos.
   */
  @IsOptional()
  @IsBoolean()
  compressionIgnition?: boolean;

  @IsOptional()
  @IsString()
  rawHex?: string;

  @IsOptional()
  @IsBoolean()
  batteryResetSuspected?: boolean;
}

/** Protocolo OBD-II detectado con `ATDPN`. */
export class ProtocolDto {
  @IsOptional()
  @IsString()
  @Matches(/^[1-9A-C]$/i, {
    message: 'El número de protocolo ELM327 debe estar entre 1 y 9 o entre A y C',
  })
  number?: string | null;

  @IsOptional()
  @IsBoolean()
  automatic?: boolean;

  @IsOptional()
  @IsBoolean()
  isCan?: boolean;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  raw?: string;
}

export class CreateScanDto {
  @IsString()
  @IsOptional()
  vehicleId?: string;

  @IsString()
  @IsOptional()
  vin?: string;

  @IsNumber()
  @IsOptional()
  batteryVoltage?: number;

  @IsString()
  @IsOptional()
  scannedAt?: string;

  /**
   * `false` cuando la aplicación no pudo leer alguna consulta obligatoria
   * (monitores o códigos). Un escaneo así no se registra: sus listas vacías
   * no significan "sin fallas", significan "no se pudo leer".
   */
  @IsBoolean()
  @IsOptional()
  complete?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReadinessStatusDto)
  readinessStatus?: ReadinessStatusDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProtocolDto)
  protocol?: ProtocolDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DtcItemDto)
  dtcs: DtcItemDto[];

  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;
}
