import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Orden creada a mano para un escaneo que no generó una por su cuenta. */
export class CreateWorkOrderDto {
  @IsUUID()
  scanId: string;

  /** Motivo. Si se omite, se usa la evaluación automática del escaneo. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
