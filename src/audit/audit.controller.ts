import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermission(Permission.AUDIT_READ)
  @Get()
  findAll(
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAllAuditLogs({
      entity,
      action,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @RequirePermission(Permission.AUDIT_READ)
  @Get('notifications')
  findNotifications(@Query('limit') limit?: string) {
    return this.auditService.findAllNotificationLogs(
      limit ? parseInt(limit, 10) : 100,
    );
  }
}
