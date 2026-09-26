import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class N8nService {
  constructor(private configService: ConfigService) {}

  // TODO: Implement webhook trigger in Phase 5
}
