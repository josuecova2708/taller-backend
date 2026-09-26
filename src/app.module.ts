import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ScansModule } from './scans/scans.module';
import { DiagnosisModule } from './diagnosis/diagnosis.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { AiModule } from './ai/ai.module';
import { N8nModule } from './n8n/n8n.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    VehiclesModule,
    ScansModule,
    DiagnosisModule,
    WorkOrdersModule,
    AiModule,
    N8nModule,
  ],
})
export class AppModule {}
