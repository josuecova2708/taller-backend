import { Module } from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';
import { AiModule } from '../ai/ai.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';

@Module({
  imports: [AiModule, WorkOrdersModule],
  providers: [DiagnosisService],
  exports: [DiagnosisService],
})
export class DiagnosisModule {}
