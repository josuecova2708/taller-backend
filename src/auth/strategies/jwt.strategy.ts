import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Sin valor por defecto: `validateEnv` ya garantizó que exista al arrancar.
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET no está configurado.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * El token dura días, así que no alcanza con que la firma sea válida: se
   * consulta la cuenta en cada petición. Una cuenta desactivada deja de entrar
   * de inmediato, y un cambio de rol rige sin esperar a que el token venza.
   */
  async validate(payload: JwtPayload) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, active: true },
    });

    if (!usuario || !usuario.active) {
      throw new UnauthorizedException('La cuenta no existe o está desactivada.');
    }

    return { sub: usuario.id, email: usuario.email, role: usuario.role };
  }
}
