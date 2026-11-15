import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

/** Estados a los que puede mover una orden quien solo puede avanzarla. */
export const ESTADOS_NO_TERMINALES = [
  WorkOrderStatus.OPEN,
  WorkOrderStatus.IN_PROGRESS,
] as const;

export class AdvanceWorkOrderDto {
  @IsEnum(ESTADOS_NO_TERMINALES, {
    message:
      'Solo se permite OPEN o IN_PROGRESS. Para cerrar la orden use POST /work-orders/:id/close.',
  })
  status: (typeof ESTADOS_NO_TERMINALES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
