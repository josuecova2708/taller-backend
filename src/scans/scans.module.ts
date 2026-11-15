import { Module } from '@nestjs/common';
import { ScansService } from './scans.service';
import { ScansController } from './scans.controller';
import { ObdModule } from '../obd/obd.module';
import { DiagnosisModule } from '../diagnosis/diagnosis.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { N8nModule } from '../n8n/n8n.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [ObdModule, DiagnosisModule, WorkOrdersModule, N8nModule, PushModule],
  controllers: [ScansController],
  providers: [ScansService],
  exports: [ScansService],
})
export class ScansModule {}
