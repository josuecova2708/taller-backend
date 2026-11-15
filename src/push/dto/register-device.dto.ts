import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Token que Firebase le entrega a la app en cada teléfono. */
export class RegisterDeviceDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
}
