import { IsString, IsOptional, IsInt, Min, Max, IsEnum, IsUUID } from 'class-validator';
import { VehicleStatus } from '@prisma/client';

export class UpdateVehicleDto {
  @IsString()
  @IsOptional()
  plate?: string;

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

  /**
   * Inspector responsable. `null` quita el responsable; ausente, no lo cambia.
   * (`@IsOptional` deja pasar `null` sin validar el UUID.)
   */
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
