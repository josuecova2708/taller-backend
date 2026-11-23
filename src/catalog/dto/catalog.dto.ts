import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateOrganizationalUnitDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la unidad es obligatorio.' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El código o sigla es obligatorio.' })
  code: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsUUID('all', { message: 'La unidad padre indicada no es válida.' })
  @IsOptional()
  parentId?: string | null;
}

export class CreateVehicleCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la categoría es obligatorio.' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  inspectionCycleDays?: number;
}

export class CreateVehicleBrandDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la marca es obligatorio.' })
  name: string;

  @IsString()
  @IsOptional()
  countryOrigin?: string;
}

export class CreateVehicleModelDto {
  @IsUUID('all', { message: 'Debe seleccionar una marca válida.' })
  brandId: string;

  @IsUUID('all')
  @IsOptional()
  categoryId?: string | null;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del modelo es obligatorio.' })
  name: string;

  @IsString()
  @IsOptional()
  engineType?: string;

  @IsString()
  @IsOptional()
  displacement?: string;
}

export class CreateSparePartCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la categoría de repuesto es obligatorio.' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateSparePartDto {
  @IsUUID('all', { message: 'Debe indicar una categoría válida.' })
  categoryId: string;

  @IsString()
  @IsNotEmpty({ message: 'El código SKU es obligatorio.' })
  sku: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del repuesto es obligatorio.' })
  name: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitCost?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;
}

export class UpdateSparePartDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitCost?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateSpecialtyDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
