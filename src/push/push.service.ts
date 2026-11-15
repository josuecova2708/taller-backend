import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import { Permission, roleHasPermission } from '../auth/permissions';
import {
  CANAL_ALERTAS,
  construirPush,
  leerCuentaServicio,
  MensajePush,
} from './push.messages';

export interface ResultadoPush {
  enviado: boolean;
  /** A cuántos teléfonos llegó. */
  dispositivos: number;
  /** Por qué no se envió, en palabras que se le pueden mostrar al usuario. */
  motivo?: string;
}

/** Lo mínimo de Firebase que usa el servicio; permite sustituirlo en pruebas. */
export interface EmisorPush {
  sendEachForMulticast(mensaje: {
    tokens: string[];
    notification: { title: string; body: string };
    data: Record<string, string>;
    android: { priority: 'high'; notification: { channelId: string } };
  }): Promise<{
    successCount: number;
    responses: Array<{ success: boolean; error?: { code: string } }>;
  }>;
}

/** Errores de FCM que significan que el token ya no sirve y hay que borrarlo. */
const TOKEN_INVALIDO = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

/** FCM acepta hasta 500 destinatarios por envío. */
const LOTE = 500;

/**
 * Notificaciones push al celular (CU18).
 *
 * Las envía el backend directo a Firebase Cloud Messaging, no n8n: el backend
 * ya tiene la orden y los tokens de los teléfonos. Igual que el aviso por
 * n8n, es un complemento: si Firebase no está configurado o no responde, el
 * escaneo y la orden quedan registrados igual.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  /** `undefined` = todavía no se intentó conectar; `null` = no disponible. */
  private emisor: EmisorPush | null | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Conexión con Firebase, creada la primera vez que hace falta. */
  protected obtenerEmisor(): EmisorPush | null {
    if (this.emisor !== undefined) return this.emisor;

    const valor = this.configService
      .get<string>('FIREBASE_SERVICE_ACCOUNT')
      ?.trim();
    if (!valor) {
      this.emisor = null;
      return null;
    }

    try {
      const cuenta = leerCuentaServicio(valor, (ruta) =>
        readFileSync(ruta, 'utf8'),
      );
      const app = initializeApp({ credential: cert(cuenta) }, 'taller-push');
      this.emisor = getMessaging(app) as unknown as EmisorPush;
      this.logger.log(
        `Push habilitado (proyecto de Firebase ${cuenta.projectId})`,
      );
    } catch (error) {
      this.emisor = null;
      this.logger.error(
        'Push deshabilitado: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
    return this.emisor;
  }

  /**
   * Guarda el token del teléfono para la cuenta que inició sesión.
   * Si el teléfono ya estaba registrado con otra cuenta, pasa a la nueva.
   */
  async registrarDispositivo(
    userId: string,
    token: string,
    platform = 'android',
  ) {
    const dispositivo = await this.prisma.device.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
      select: { id: true, platform: true, updatedAt: true },
    });
    return { ...dispositivo, pushHabilitado: this.obtenerEmisor() !== null };
  }

  /** Al cerrar sesión, el teléfono deja de recibir avisos de esa cuenta. */
  async quitarDispositivo(userId: string, token: string) {
    const { count } = await this.prisma.device.deleteMany({
      where: { userId, token },
    });
    return { eliminado: count > 0 };
  }

  /**
   * Avisa de una orden de trabajo nueva a los teléfonos de quienes pueden
   * atenderla: cuentas activas con permiso para ver órdenes (administradores
   * y mecánicos).
   *
   * Nunca lanza: devuelve si se envió y, si no, el motivo.
   */
  async notificarOrden(workOrderId: string): Promise<ResultadoPush> {
    try {
      if (!this.obtenerEmisor()) {
        return this.noEnviado('Las notificaciones push no están configuradas.');
      }

      const orden = await this.prisma.workOrder.findUnique({
        where: { id: workOrderId },
        include: {
          vehicle: { select: { plate: true, alias: true } },
          scan: { include: { dtcEntries: { select: { code: true } } } },
        },
      });
      if (!orden) return this.noEnviado('La orden de trabajo no existe.');

      const roles = Object.values(UserRole).filter((rol) =>
        roleHasPermission(rol, Permission.ORDER_READ),
      );
      const dispositivos = await this.prisma.device.findMany({
        where: { user: { active: true, role: { in: roles } } },
        select: { token: true },
      });

      const resultado = await this.enviar(
        dispositivos.map((d) => d.token),
        construirPush(orden),
      );
      if (resultado.enviado) {
        this.logger.log(
          `Push de la orden ${workOrderId} entregado a ` +
            `${resultado.dispositivos} dispositivo(s)`,
        );
      }
      return resultado;
    } catch (error) {
      this.logger.warn(
        `No se pudo enviar el push de la orden ${workOrderId}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return this.noEnviado(
        'No se pudo conectar con el servicio de notificaciones.',
      );
    }
  }

  /** Push de prueba a los teléfonos de la propia cuenta. */
  async enviarPrueba(userId: string): Promise<ResultadoPush> {
    try {
      if (!this.obtenerEmisor()) {
        return this.noEnviado(
          'Las notificaciones push no están configuradas en el servidor.',
        );
      }
      const dispositivos = await this.prisma.device.findMany({
        where: { userId },
        select: { token: true },
      });
      return await this.enviar(
        dispositivos.map((d) => d.token),
        {
          titulo: 'Notificación de prueba',
          cuerpo:
            'Este teléfono recibirá los avisos de órdenes de trabajo nuevas.',
          datos: { tipo: 'prueba' },
        },
      );
    } catch (error) {
      this.logger.warn(
        'No se pudo enviar el push de prueba: ' +
          (error instanceof Error ? error.message : String(error)),
      );
      return this.noEnviado(
        'No se pudo conectar con el servicio de notificaciones.',
      );
    }
  }

  private noEnviado(motivo: string): ResultadoPush {
    return { enviado: false, dispositivos: 0, motivo };
  }

  private async enviar(
    tokens: string[],
    mensaje: MensajePush,
  ): Promise<ResultadoPush> {
    const emisor = this.obtenerEmisor();
    if (!emisor) {
      return this.noEnviado('Las notificaciones push no están configuradas.');
    }
    if (tokens.length === 0) {
      return this.noEnviado(
        'No hay teléfonos registrados para recibir el aviso.',
      );
    }

    let entregados = 0;
    const invalidos: string[] = [];

    for (let i = 0; i < tokens.length; i += LOTE) {
      const lote = tokens.slice(i, i + LOTE);
      const respuesta = await emisor.sendEachForMulticast({
        tokens: lote,
        notification: { title: mensaje.titulo, body: mensaje.cuerpo },
        data: mensaje.datos,
        android: {
          priority: 'high',
          notification: { channelId: CANAL_ALERTAS },
        },
      });
      entregados += respuesta.successCount;
      respuesta.responses.forEach((r, indice) => {
        if (!r.success && r.error && TOKEN_INVALIDO.includes(r.error.code)) {
          invalidos.push(lote[indice]);
        }
      });
    }

    // Un token deja de servir cuando se desinstala la app o se borran sus datos.
    if (invalidos.length > 0) {
      await this.prisma.device.deleteMany({
        where: { token: { in: invalidos } },
      });
      this.logger.log(
        `Se quitaron ${invalidos.length} dispositivo(s) que ya no existen`,
      );
    }

    if (entregados === 0) {
      return this.noEnviado(
        'Firebase no pudo entregar el aviso a ningún teléfono.',
      );
    }
    return { enviado: true, dispositivos: entregados };
  }
}
