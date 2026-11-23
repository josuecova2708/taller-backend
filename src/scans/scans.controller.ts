import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';
import { DiagnosisService } from '../diagnosis/diagnosis.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Permission } from '../auth/permissions';

@Controller('scans')
export class ScansController {
  constructor(
    private readonly scansService: ScansService,
    private readonly diagnosisService: DiagnosisService,
  ) {}

  @RequirePermission(Permission.SCAN_READ)
  @Get()
  findAll(@GetUser('sub') userId: string, @GetUser('role') userRole: string) {
    return this.scansService.findAll(
      userRole === 'INSPECTOR' ? userId : undefined,
    );
  }

  /** Escaneos que requerían hipótesis y todavía no la tienen. */
  @RequirePermission(Permission.DIAGNOSIS_READ)
  @Get('pending-diagnosis')
  findPendingDiagnosis() {
    return this.diagnosisService.findPending();
  }

  @RequirePermission(Permission.SCAN_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scansService.findOne(id);
  }

  /**
   * Hipótesis técnica del escaneo.
   *
   * Devuelve 404 con mensajes distintos según si la hipótesis se está
   * generando o si el escaneo no requería evaluación: la interfaz necesita
   * distinguir ambos casos para saber si debe seguir refrescando.
   */
  @RequirePermission(Permission.DIAGNOSIS_READ)
  @Get(':id/diagnosis')
  findDiagnosis(@Param('id') id: string) {
    return this.diagnosisService.findByScan(id);
  }

  /**
   * Reintenta la generación de la hipótesis.
   *
   * Necesario porque la hipótesis se genera en segundo plano: si el proveedor
   * falla, si se agota el crédito o si el proceso se reinicia a mitad de
   * camino, el escaneo queda con `aiProcessed = false` y este endpoint lo
   * recupera sin tener que volver a escanear el vehículo.
   */
  @RequirePermission(Permission.DIAGNOSIS_READ)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':id/diagnosis')
  async retryDiagnosis(@Param('id') id: string) {
    void this.diagnosisService.processScan(id);
    return {
      scanId: id,
      status: 'generando',
      message: 'La hipótesis se está generando en segundo plano.',
    };
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
