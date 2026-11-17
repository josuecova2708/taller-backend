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
import { Actor, WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { N8nService } from '../n8n/n8n.service';
import { PushService } from '../push/push.service';
import { AdvanceWorkOrderDto } from './dto/advance-work-order.dto';
import { CloseWorkOrderDto } from './dto/close-work-order.dto';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Permission } from '../auth/permissions';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly n8nService: N8nService,
    private readonly pushService: PushService,
  ) {}

  @RequirePermission(Permission.ORDER_READ)
  @Get()
  findAll() {
    return this.workOrdersService.findAll();
  }

  @RequirePermission(Permission.ORDER_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workOrdersService.findOne(id);
  }

  /**
   * Un mecánico toma una orden abierta y sin asignar: queda a su cargo y en
   * proceso. Si otro la tomó antes, responde 409 con su nombre.
   */
  @RequirePermission(Permission.ORDER_UPDATE_STATUS)
  @HttpCode(HttpStatus.OK)
  @Post(':id/take')
  take(@Param('id') id: string, @GetUser() actor: Actor) {
    return this.workOrdersService.take(id, actor);
  }

  /**
   * Avance de la orden entre estados no terminales.
   *
   * Operación del mecánico asignado: registrar que trabaja y dejar notas.
   */
  @RequirePermission(Permission.ORDER_UPDATE_STATUS)
  @Patch(':id/status')
  advance(
    @Param('id') id: string,
    @Body() dto: AdvanceWorkOrderDto,
    @GetUser() actor: Actor,
  ) {
    return this.workOrdersService.advanceStatus(id, dto.status, dto.notes, actor);
  }

  /**
   * Cierre de la orden, con justificación obligatoria.
   *
   * El mecánico cierra la orden que tiene asignada y el administrador
   * cualquiera (el servicio lo comprueba). Cerrarla como completada devuelve
   * el vehículo a operativo: es la decisión humana que el sistema nunca
   * automatiza, y queda registrado quién la tomó.
   *
   * Después avisa al responsable del vehículo y a los administradores, en
   * segundo plano y sin condicionar la respuesta.
   */
  @RequirePermission(Permission.ORDER_CLOSE)
  @Post(':id/close')
  async close(
    @Param('id') id: string,
    @Body() dto: CloseWorkOrderDto,
    @GetUser() actor: Actor,
  ) {
    const resultado = await this.workOrdersService.close(
      id,
      dto.status,
      dto.resolution,
      actor,
    );
    void this.pushService.notificarCierre(id);
    return resultado;
  }

  /**
   * Orden creada a mano (CU13, flujo alterno). La creación habitual es
   * automática, al registrar el escaneo.
   */
  @RequirePermission(Permission.ORDER_CREATE)
  @Post()
  async create(@Body() dto: CreateWorkOrderDto, @GetUser() actor: Actor) {
    const orden = await this.workOrdersService.createManual(
      dto.scanId,
      dto.description,
      actor,
    );
    // Los avisos no retrasan ni condicionan la respuesta.
    void this.n8nService.notificarAlerta(orden.id);
    void this.pushService.notificarOrden(orden.id);
    return orden;
  }

  /**
   * Reenvía el aviso de la orden (CU17). Sirve cuando n8n no estaba
   * disponible al crearla. Responde si se pudo enviar y, si no, por qué.
   */
  @RequirePermission(Permission.ORDER_ASSIGN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/notify')
  async notify(@Param('id') id: string) {
    await this.workOrdersService.findOne(id);
    return this.n8nService.notificarAlerta(id);
  }

  @RequirePermission(Permission.ORDER_ASSIGN)
  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignWorkOrderDto) {
    return this.workOrdersService.assign(id, dto.assignedToId ?? null);
  }
}
