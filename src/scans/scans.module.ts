import { Module } from '@nestjs/common';
import { ScansService } from './scans.service';
import { ScansController } from './scans.controller';
import { DeterministicFilterService } from './deterministic-filter.service';

@Module({
  controllers: [ScansController],
  providers: [ScansService, DeterministicFilterService],
  exports: [ScansService, DeterministicFilterService],
})
export class ScansModule {}
