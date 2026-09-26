import { Module } from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';

@Module({
  providers: [DiagnosisService],
  exports: [DiagnosisService],
})
export class DiagnosisModule {}
