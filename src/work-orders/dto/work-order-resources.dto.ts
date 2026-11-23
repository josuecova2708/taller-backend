import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateWorkOrderTaskDto {
  @IsString()
  @IsNotEmpty({ message: 'La descripción de la tarea es obligatoria.' })
  description: string;
}

export class ToggleWorkOrderTaskDto {
  @IsBoolean()
  completed: boolean;
}

export class AddWorkOrderPartDto {
  @IsUUID('all', { message: 'Debe seleccionar un repuesto válido.' })
  sparePartId: string;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
