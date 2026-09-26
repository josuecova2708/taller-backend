import { Controller } from '@nestjs/common';
import { ScansService } from './scans.service';

@Controller('scans')
export class ScansController {
  constructor(private scansService: ScansService) {}

  // TODO: Implement POST /scans in Phase 2
}
