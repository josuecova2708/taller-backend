import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators/public.decorator';
import { N8nService } from './n8n.service';

function mismaClave(recibida: string, esperada: string): boolean {
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('n8n')
export class N8nController {
  constructor(
    private readonly n8nService: N8nService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resumen diario para el flujo con temporizador de n8n (CU19).
   *
   * n8n no es una persona con cuenta, así que no usa un token de sesión: se
   * identifica con una clave de servicio en la cabecera `X-Service-Key`. Sin
   * clave configurada el endpoint queda cerrado.
   */
  @Public()
  @Get('daily-summary')
  resumenDiario(@Headers('x-service-key') clave?: string) {
    const esperada = this.configService.get<string>('N8N_SERVICE_KEY')?.trim();
    if (!esperada) {
      throw new ServiceUnavailableException(
        'El resumen diario no está habilitado: falta N8N_SERVICE_KEY.',
      );
    }
    if (!clave || !mismaClave(clave, esperada)) {
      throw new ForbiddenException('Clave de servicio inválida.');
    }

    return this.n8nService.resumenDiario();
  }
}
