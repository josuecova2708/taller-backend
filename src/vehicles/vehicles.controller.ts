import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @RequirePermission(Permission.VEHICLE_READ)
  @Get()
  findAll() {
    return this.vehiclesService.findAll();
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
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
