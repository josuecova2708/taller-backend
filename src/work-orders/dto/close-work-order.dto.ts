import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

/** Estados terminales: cerrar la orden es una decisión formal. */
export const ESTADOS_TERMINALES = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CANCELLED,
] as const;

export class CloseWorkOrderDto {
  @IsEnum(ESTADOS_TERMINALES, {
    message: 'Solo se permite COMPLETED o CANCELLED al cerrar una orden.',
  })
  status: (typeof ESTADOS_TERMINALES)[number];

  /**
   * Justificación del cierre. Obligatoria: cerrar una orden es la decisión que
   * habilita al vehículo a volver a operar, y debe quedar registrada.
   */
  @IsString()
  @IsNotEmpty({ message: 'La nota de cierre es obligatoria.' })
  @MaxLength(2000)
  resolution: string;

  /**
   * Autoriza formalmente que el vehículo vuelva a operar (permiso
   * `vehicle:authorize`). Es una decisión aparte del cierre: una orden puede
   * cerrarse sin que el vehículo quede habilitado.
   */
  @IsOptional()
  @IsBoolean()
  authorizeOperation?: boolean;
}
