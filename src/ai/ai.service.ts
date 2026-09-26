import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, DiagnosisInput, DiagnosisOutput } from './ai.interface';

@Injectable()
export class AiService {
  private provider: AiProvider | null = null;

  constructor(private configService: ConfigService) {
    // TODO: Initialize provider based on AI_PROVIDER env var in Phase 3
  }

  async diagnose(input: DiagnosisInput): Promise<DiagnosisOutput> {
    // TODO: Implement in Phase 3
    throw new Error('AI provider not configured yet. Coming in Phase 3.');
  }
}
