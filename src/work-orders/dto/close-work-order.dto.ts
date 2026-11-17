import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

/** Estados terminales con los que se cierra una orden. */
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
   * Justificación del cierre. Obligatoria: cerrar una orden como completada
   * devuelve el vehículo a operativo, y queda registrado quién lo decidió y
   * por qué.
   */
  @IsString()
  @IsNotEmpty({ message: 'La nota de cierre es obligatoria.' })
  @MaxLength(2000)
  resolution: string;
}
