import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, WorkOrderStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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
  unitId: true,
  unit: { select: { id: true, name: true, code: true, type: true } },
  mechanicProfile: {
    include: {
      specialties: {
        include: { specialty: { select: { id: true, code: true, name: true } } },
      },
    },
  },
  inspectorProfile: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private buildSession(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    unitId?: string | null;
    unit?: { id: string; name: string; code: string; type: string } | null;
  }) {
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
        unitId: user.unitId ?? null,
        unit: user.unit ?? null,
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
    const role = dto.role ?? UserRole.INSPECTOR;

    // Los mecánicos pertenecen al taller general y no a una organización/facultad específica.
    const unitId =
      role === UserRole.MECHANIC ? null : dto.unitId ? dto.unitId : null;

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash,
        role,
        unitId,
      },
      include: {
        unit: { select: { id: true, name: true, code: true, type: true } },
      },
    });

    await this.sincronizarPerfilSubtipo(user.id, role, dto);

    void this.auditService?.record({
      userId: user.id,
      action: 'CREATE',
      entity: 'USER',
      entityId: user.id,
      summary: `Usuario creado: ${user.name} (${user.email}) con rol ${ROLE_LABELS[user.role]}`,
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

    void this.auditService?.record({
      userId: user.id,
      action: 'LOGIN',
      entity: 'USER',
      entityId: user.id,
      summary: `Inicio de sesión de ${user.name} (${ROLE_LABELS[user.role]})`,
    });

    return this.buildSession(user);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        unit: { select: { id: true, name: true, code: true, type: true } },
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no encontrado o desactivado');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      unitId: user.unitId ?? null,
      unit: user.unit ?? null,
      permissions: permissionsForRole(user.role),
    };
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: CAMPOS_PUBLICOS,
    });

    return users.map((user) => ({
      ...user,
      roleLabel: ROLE_LABELS[user.role],
    }));
  }

  /**
   * Edita nombre, correo, unidad organizacional, rol o perfil especializado de una cuenta.
   *
   * Nadie cambia su propio rol: así el sistema no puede quedarse sin
   * administrador por un descuido (siempre queda al menos quien edita).
   */
  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    const usuario = await this.buscarUsuario(id);
    const data: { email?: string; name?: string; role?: UserRole; unitId?: string | null } = {};

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
    if (dto.unitId !== undefined) data.unitId = dto.unitId || null;

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

    const rolFinal = data.role ?? usuario.role;
    if (rolFinal === UserRole.MECHANIC) {
      data.unitId = null;
    }
    await this.sincronizarPerfilSubtipo(id, rolFinal, dto);

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

    void this.auditService?.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'USER',
      entityId: actualizado.id,
      summary: `Usuario actualizado: ${actualizado.name} (${ROLE_LABELS[actualizado.role]})`,
    });

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

  /**
   * Mantiene sincronizadas las tablas de generalización / especialización (1:1)
   * `mechanic_profiles` e `inspector_profiles` cuando se crea o edita un usuario.
   */
  private async sincronizarPerfilSubtipo(
    userId: string,
    role: UserRole,
    dto: Partial<RegisterDto & UpdateUserDto>,
  ): Promise<void> {
    const p = this.prisma as any;
    const tieneCamposMecanico =
      dto.employeeCode !== undefined ||
      dto.workshopBay !== undefined ||
      dto.experienceYears !== undefined ||
      dto.shift !== undefined ||
      dto.specialtyIds !== undefined;

    const tieneCamposInspector =
      dto.credentialNumber !== undefined ||
      dto.assignedZone !== undefined ||
      dto.licenseCategory !== undefined ||
      dto.canAuthorizeRoute !== undefined;

    if (role === UserRole.MECHANIC && p.mechanicProfile && tieneCamposMecanico) {
      const code =
        dto.employeeCode?.trim().toUpperCase() || `MEC-${userId.slice(0, 6).toUpperCase()}`;
      await p.mechanicProfile.upsert({
        where: { userId },
        create: {
          userId,
          employeeCode: code,
          workshopBay: dto.workshopBay?.trim() || 'Bahía 1',
          experienceYears: dto.experienceYears ?? 1,
          shift: dto.shift?.trim() || 'MAÑANA',
        },
        update: {
          ...(dto.employeeCode ? { employeeCode: code } : {}),
          ...(dto.workshopBay ? { workshopBay: dto.workshopBay.trim() } : {}),
          ...(dto.experienceYears !== undefined
            ? { experienceYears: dto.experienceYears }
            : {}),
          ...(dto.shift ? { shift: dto.shift.trim() } : {}),
        },
      });

      if (Array.isArray(dto.specialtyIds) && p.mechanicSpecialty) {
        await p.mechanicSpecialty.deleteMany({ where: { mechanicUserId: userId } });
        for (const specialtyId of dto.specialtyIds) {
          await p.mechanicSpecialty.create({
            data: { mechanicUserId: userId, specialtyId },
          });
        }
      }
    }

    if (role === UserRole.INSPECTOR && p.inspectorProfile && tieneCamposInspector) {
      const cred =
        dto.credentialNumber?.trim().toUpperCase() || `INSP-${userId.slice(0, 6).toUpperCase()}`;
      await p.inspectorProfile.upsert({
        where: { userId },
        create: {
          userId,
          credentialNumber: cred,
          assignedZone: dto.assignedZone?.trim() || 'Campus Universitario',
          licenseCategory: dto.licenseCategory?.trim() || 'B',
          canAuthorizeRoute: dto.canAuthorizeRoute ?? true,
        },
        update: {
          ...(dto.credentialNumber ? { credentialNumber: cred } : {}),
          ...(dto.assignedZone ? { assignedZone: dto.assignedZone.trim() } : {}),
          ...(dto.licenseCategory ? { licenseCategory: dto.licenseCategory.trim() } : {}),
          ...(dto.canAuthorizeRoute !== undefined
            ? { canAuthorizeRoute: dto.canAuthorizeRoute }
            : {}),
        },
      });
    }
  }
}
