import { Module } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { ObdModule } from '../obd/obd.module';
import { N8nModule } from '../n8n/n8n.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [ObdModule, N8nModule, PushModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
