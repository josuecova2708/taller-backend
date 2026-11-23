import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { VehicleStatus } from '@prisma/client';

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty({ message: 'La placa es obligatoria' })
  plate: string;

  @IsString()
  @IsOptional()
  vin?: string;

  @IsString()
  @IsOptional()
  alias?: string;

  @IsString()
  @IsOptional()
  make?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsInt()
  @Min(1980)
  @Max(2030)
  @IsOptional()
  year?: number;

  @IsEnum(VehicleStatus)
  @IsOptional()
  status?: VehicleStatus;

  /** Inspector responsable del vehículo. `null` o ausente: sin responsable. */
  @IsUUID('all', { message: 'El responsable indicado no es válido.' })
  @IsOptional()
  responsibleId?: string | null;

  @IsUUID('all', { message: 'El modelo seleccionado no es válido.' })
  @IsOptional()
  modelId?: string | null;

  @IsUUID('all', { message: 'La categoría seleccionada no es válida.' })
  @IsOptional()
  categoryId?: string | null;

  @IsUUID('all', { message: 'La unidad organizacional seleccionada no es válida.' })
  @IsOptional()
  unitId?: string | null;
}
