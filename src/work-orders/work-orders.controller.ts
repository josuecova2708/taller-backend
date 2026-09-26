import { Controller } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private workOrdersService: WorkOrdersService) {}

  // TODO: Implement in Phase 3
}
