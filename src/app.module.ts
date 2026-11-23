import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ScansModule } from './scans/scans.module';
import { DiagnosisModule } from './diagnosis/diagnosis.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { AiModule } from './ai/ai.module';
import { N8nModule } from './n8n/n8n.module';
import { PushModule } from './push/push.module';
import { AuditModule } from './audit/audit.module';
import { CatalogModule } from './catalog/catalog.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuditModule,
    CatalogModule,
    AuthModule,
    VehiclesModule,
    ScansModule,
    DiagnosisModule,
    WorkOrdersModule,
    AiModule,
    N8nModule,
    PushModule,
  ],
  providers: [
    // Orden significativo: primero se autentica, después se autoriza.
    // Todo endpoint queda cerrado por defecto; se abre con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
