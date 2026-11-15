import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignWorkOrderDto {
  /** `null` o ausente desasigna la orden. */
  @IsOptional()
  @IsString()
  @IsUUID()
  assignedToId?: string | null;
}
