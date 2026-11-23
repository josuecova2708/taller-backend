import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

/** Datos editables de una cuenta. La contraseña y el estado van aparte. */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsUUID('all')
  unitId?: string | null;

  // Campos de especialización (Generalización / Herencia 1:1)
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsString()
  workshopBay?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @IsString()
  shift?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  specialtyIds?: string[];

  @IsOptional()
  @IsString()
  credentialNumber?: string;

  @IsOptional()
  @IsString()
  assignedZone?: string;

  @IsOptional()
  @IsString()
  licenseCategory?: string;

  @IsOptional()
  @IsBoolean()
  canAuthorizeRoute?: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;
}

export class SetUserActiveDto {
  @IsBoolean()
  active: boolean;
}
