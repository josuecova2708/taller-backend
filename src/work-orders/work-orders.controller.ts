import { Controller, Get } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @RequirePermission(Permission.ORDER_READ)
  @Get()
  findAll() {
    return this.workOrdersService.findAll();
  }
}
