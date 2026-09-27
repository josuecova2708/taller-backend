import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
  IsObject,
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

export class ReadinessStatusDto {
  @IsOptional()
  milOn?: boolean;

  @IsOptional()
  dtcCount?: number;

  @IsOptional()
  monitorsCompleted?: boolean;

  @IsOptional()
  @IsArray()
  incompleteMonitors?: string[];

  @IsOptional()
  @IsString()
  rawHex?: string;

  @IsOptional()
  batteryResetSuspected?: boolean;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => ReadinessStatusDto)
  readinessStatus?: ReadinessStatusDto;

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
