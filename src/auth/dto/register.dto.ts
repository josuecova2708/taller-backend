import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  /**
   * Rol asignado por el administrador. Si se omite, se crea como INSPECTOR.
   * Solo cuentas con `user:manage` pueden invocar este endpoint, de modo que un
   * usuario no puede autoasignarse un rol.
   */
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
