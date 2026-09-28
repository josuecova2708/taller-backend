import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Permission } from '../auth/permissions';

@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @RequirePermission(Permission.SCAN_READ)
  @Get()
  findAll() {
    return this.scansService.findAll();
  }

  @RequirePermission(Permission.SCAN_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scansService.findOne(id);
  }

  /**
   * El escaneo se atribuye siempre al portador del token. No hay fallback a un
   * usuario por defecto: la trazabilidad de quién realizó cada escaneo es un
   * requisito del sistema, no un detalle opcional.
   */
  @RequirePermission(Permission.SCAN_CREATE)
  @Post()
  create(@Body() dto: CreateScanDto, @GetUser('sub') userId: string) {
    return this.scansService.create(dto, userId);
  }
}
