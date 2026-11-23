import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Permission } from '../auth/permissions';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  /**
   * Flota. Con `?mine=true`, solo los vehículos de los que el usuario del
   * token es responsable (la pantalla «Mis vehículos» del inspector).
   */
  @RequirePermission(Permission.VEHICLE_READ)
  @Get()
  findAll(
    @GetUser('sub') userId: string,
    @GetUser('role') userRole: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('mine') mine?: string,
  ) {
    return this.vehiclesService.findAll(
      includeInactive === 'true',
      mine === 'true' ? userId : undefined,
      userRole === 'INSPECTOR' ? userId : undefined,
    );
  }

  @RequirePermission(Permission.VEHICLE_READ)
  @Get('vin/:vin')
  findByVin(@Param('vin') vin: string) {
    return this.vehiclesService.findByVin(vin);
  }

  @RequirePermission(Permission.VEHICLE_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @RequirePermission(Permission.VEHICLE_READ)
  @Get(':id/scans')
  findVehicleScans(@Param('id') id: string) {
    return this.vehiclesService.findVehicleScans(id);
  }

  @RequirePermission(Permission.VEHICLE_WRITE)
  @Post()
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @RequirePermission(Permission.VEHICLE_WRITE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, dto);
  }

  @RequirePermission(Permission.VEHICLE_WRITE)
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.vehiclesService.reactivate(id);
  }

  /** Baja lógica: el vehículo deja la flota activa pero conserva su historial. */
  @RequirePermission(Permission.VEHICLE_WRITE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
