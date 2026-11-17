import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, WorkOrderStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ROLE_LABELS, permissionsForRole } from './permissions';

const BCRYPT_ROUNDS = 10;

/** Lo único de una cuenta que sale por la API: nunca el hash de la contraseña. */
const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private buildSession(user: { id: string; email: string; name: string; role: UserRole }) {
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
        permissions: permissionsForRole(user.role),
      },
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash,
        role: dto.role ?? UserRole.INSPECTOR,
      },
    });

    return this.buildSession(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mismo mensaje para usuario inexistente y contraseña incorrecta: no revela
    // qué emails existen en el sistema.
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Se comprueba DESPUÉS de la contraseña: así solo quien conoce las
    // credenciales se entera de que la cuenta existe y está desactivada.
    if (!user.active) {
      throw new UnauthorizedException(
        'Su cuenta está desactivada. Contacte al administrador.',
      );
    }

    return this.buildSession(user);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no encontrado o desactivado');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      permissions: permissionsForRole(user.role),
    };
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });

    return users.map((user) => ({
      ...user,
      roleLabel: ROLE_LABELS[user.role],
    }));
  }

  /**
   * Edita nombre, correo o rol de una cuenta.
   *
   * Nadie cambia su propio rol: así el sistema no puede quedarse sin
   * administrador por un descuido (siempre queda al menos quien edita).
   */
  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    const usuario = await this.buscarUsuario(id);
    const data: { email?: string; name?: string; role?: UserRole } = {};

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== usuario.email) {
        const otro = await this.prisma.user.findUnique({ where: { email } });
        if (otro) {
          throw new ConflictException('Ya existe una cuenta con ese correo.');
        }
        data.email = email;
      }
    }

    if (dto.name !== undefined) data.name = dto.name.trim();

    if (dto.role !== undefined && dto.role !== usuario.role) {
      if (id === actorId) {
        throw new BadRequestException(
          'No puede cambiar su propio rol. Pídaselo a otro administrador.',
        );
      }
      // Un mecánico con órdenes en curso no puede dejar de ser mecánico:
      // esas órdenes quedarían asignadas a alguien que ya no puede avanzarlas.
      if (usuario.role === UserRole.MECHANIC) {
        await this.exigirSinOrdenesAbiertas(id, 'cambiarle el rol');
      }
      data.role = dto.role;
    }

    const actualizado = await this.prisma.user.update({
      where: { id },
      data,
      select: CAMPOS_PUBLICOS,
    });

    // Solo un inspector puede ser responsable de un vehículo: si deja de
    // serlo, sus vehículos quedan sin responsable.
    if (
      data.role !== undefined &&
      usuario.role === UserRole.INSPECTOR &&
      data.role !== UserRole.INSPECTOR
    ) {
      await this.liberarVehiculos(id);
    }

    return { ...actualizado, roleLabel: ROLE_LABELS[actualizado.role] };
  }

  /**
   * Activa o desactiva una cuenta. No se borra: los escaneos y las órdenes
   * siguen mostrando quién los hizo.
   */
  async setUserActive(id: string, active: boolean, actorId: string) {
    const usuario = await this.buscarUsuario(id);

    if (!active) {
      if (id === actorId) {
        throw new BadRequestException('No puede desactivar su propia cuenta.');
      }
      if (usuario.role === UserRole.MECHANIC) {
        await this.exigirSinOrdenesAbiertas(id, 'desactivarlo');
      }
    }

    const actualizado = await this.prisma.user.update({
      where: { id },
      data: { active },
      select: CAMPOS_PUBLICOS,
    });

    // Una cuenta desactivada no recibe avisos: sus vehículos quedan sin
    // responsable para que el administrador les asigne otro.
    if (!active) {
      await this.liberarVehiculos(id);
    }

    return { ...actualizado, roleLabel: ROLE_LABELS[actualizado.role] };
  }

  /** El administrador fija una contraseña nueva y se la entrega al usuario. */
  async resetPassword(id: string, password: string) {
    await this.buscarUsuario(id);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { id, passwordReset: true };
  }

  private async buscarUsuario(id: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('El usuario indicado no existe.');
    }
    return usuario;
  }

  /** Deja sin responsable los vehículos de una cuenta. */
  private async liberarVehiculos(userId: string): Promise<void> {
    await this.prisma.vehicle.updateMany({
      where: { responsibleId: userId },
      data: { responsibleId: null },
    });
  }

  private async exigirSinOrdenesAbiertas(userId: string, accion: string) {
    const abiertas = await this.prisma.workOrder.count({
      where: {
        assignedToId: userId,
        status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] },
      },
    });
    if (abiertas > 0) {
      throw new ConflictException(
        `Este mecánico tiene ${abiertas} ${abiertas === 1 ? 'orden de trabajo abierta' : 'órdenes de trabajo abiertas'}. ` +
          `Reasígnelas antes de ${accion}.`,
      );
    }
  }
}
