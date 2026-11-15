import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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
