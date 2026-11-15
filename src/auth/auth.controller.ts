import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  ResetPasswordDto,
  SetUserActiveDto,
  UpdateUserDto,
} from './dto/update-user.dto';
import { Public } from './decorators/public.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { Permission } from './permissions';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Alta de usuarios. Deja de ser público: antes cualquiera podía crearse una
   * cuenta y obtener un token. El administrador inicial lo provee el seed.
   */
  @RequirePermission(Permission.USER_MANAGE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Identidad y permisos efectivos del portador del token. El frontend lo usa
   * para renderizar menús y acciones según el rol, sin recalcular la matriz.
   */
  @Get('me')
  me(@GetUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Get('profile')
  profile(@GetUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @RequirePermission(Permission.USER_MANAGE)
  @Get('users')
  listUsers() {
    return this.authService.listUsers();
  }

  @RequirePermission(Permission.USER_MANAGE)
  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @GetUser('sub') actorId: string,
  ) {
    return this.authService.updateUser(id, dto, actorId);
  }

  /** Desactivar no borra: la cuenta deja de poder entrar y conserva su historial. */
  @RequirePermission(Permission.USER_MANAGE)
  @Patch('users/:id/active')
  setUserActive(
    @Param('id') id: string,
    @Body() dto: SetUserActiveDto,
    @GetUser('sub') actorId: string,
  ) {
    return this.authService.setUserActive(id, dto.active, actorId);
  }

  @RequirePermission(Permission.USER_MANAGE)
  @Patch('users/:id/password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(id, dto.password);
  }
}
