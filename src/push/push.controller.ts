import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { PushService } from './push.service';

/**
 * Teléfonos registrados para notificaciones push (CU18).
 *
 * No piden un permiso en particular: cualquier cuenta con sesión registra su
 * propio teléfono. Quién recibe cada aviso lo decide `PushService` según el
 * rol.
 */
@Controller('devices')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /** La app lo llama al iniciar sesión y cada vez que Firebase renueva el token. */
  @HttpCode(HttpStatus.OK)
  @Post()
  registrar(@Body() dto: RegisterDeviceDto, @GetUser('sub') userId: string) {
    return this.pushService.registrarDispositivo(
      userId,
      dto.token,
      dto.platform,
    );
  }

  /** La app lo llama al cerrar sesión. */
  @HttpCode(HttpStatus.OK)
  @Post('unregister')
  quitar(@Body() dto: RegisterDeviceDto, @GetUser('sub') userId: string) {
    return this.pushService.quitarDispositivo(userId, dto.token);
  }

  /** Envía un push de prueba a los teléfonos de la propia cuenta. */
  @HttpCode(HttpStatus.OK)
  @Post('test')
  probar(@GetUser('sub') userId: string) {
    return this.pushService.enviarPrueba(userId);
  }
}
