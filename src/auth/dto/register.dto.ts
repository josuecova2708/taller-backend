import { IsEmail, IsString, MinLength, MaxLength, IsEnum, IsOptional } from 'class-validator';
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
}
