import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScansService {
  constructor(private prisma: PrismaService) {}

  // TODO: Implement in Phase 2
}
