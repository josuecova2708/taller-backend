import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.workOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: true,
        diagnosis: true,
        scan: {
          include: {
            dtcEntries: true,
          },
        },
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }
}
