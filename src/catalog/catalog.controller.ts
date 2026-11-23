import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  CreateOrganizationalUnitDto,
  CreateSparePartCategoryDto,
  CreateSparePartDto,
  CreateSpecialtyDto,
  CreateVehicleBrandDto,
  CreateVehicleCategoryDto,
  CreateVehicleModelDto,
  UpdateSparePartDto,
} from './dto/catalog.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Permission } from '../auth/permissions';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // Unidades organizacionales (recursivas)
  @RequirePermission(Permission.VEHICLE_READ)
  @Get('organizational-units')
  findOrganizationalUnits() {
    return this.catalogService.findOrganizationalUnits();
  }

  @RequirePermission(Permission.VEHICLE_WRITE)
  @Post('organizational-units')
  createOrganizationalUnit(
    @Body() dto: CreateOrganizationalUnitDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.createOrganizationalUnit(dto, userId);
  }

  // Categorías, Marcas y Modelos de Vehículos (Normalización 3NF)
  @RequirePermission(Permission.VEHICLE_READ)
  @Get('vehicle-categories')
  findVehicleCategories() {
    return this.catalogService.findVehicleCategories();
  }

  @RequirePermission(Permission.VEHICLE_WRITE)
  @Post('vehicle-categories')
  createVehicleCategory(
    @Body() dto: CreateVehicleCategoryDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.createVehicleCategory(dto, userId);
  }

  @RequirePermission(Permission.VEHICLE_READ)
  @Get('vehicle-brands')
  findVehicleBrands() {
    return this.catalogService.findVehicleBrands();
  }

  @RequirePermission(Permission.VEHICLE_WRITE)
  @Post('vehicle-brands')
  createVehicleBrand(
    @Body() dto: CreateVehicleBrandDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.createVehicleBrand(dto, userId);
  }

  @RequirePermission(Permission.VEHICLE_READ)
  @Get('vehicle-models')
  findVehicleModels() {
    return this.catalogService.findVehicleModels();
  }

  @RequirePermission(Permission.VEHICLE_WRITE)
  @Post('vehicle-models')
  createVehicleModel(
    @Body() dto: CreateVehicleModelDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.createVehicleModel(dto, userId);
  }

  // Especialidades de Mecánicos
  @RequirePermission(Permission.VEHICLE_READ)
  @Get('specialties')
  findSpecialties() {
    return this.catalogService.findSpecialties();
  }

  @RequirePermission(Permission.USER_MANAGE)
  @Post('specialties')
  createSpecialty(
    @Body() dto: CreateSpecialtyDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.createSpecialty(dto, userId);
  }

  // Catálogo técnico OBD-II
  @RequirePermission(Permission.SCAN_READ)
  @Get('obd-catalog')
  findObdCatalog() {
    return this.catalogService.findObdCatalog();
  }

  // Inventario de Repuestos e Insumos de Taller
  @RequirePermission(Permission.INVENTORY_READ)
  @Get('spare-part-categories')
  findSparePartCategories() {
    return this.catalogService.findSparePartCategories();
  }

  @RequirePermission(Permission.INVENTORY_WRITE)
  @Post('spare-part-categories')
  createSparePartCategory(
    @Body() dto: CreateSparePartCategoryDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.createSparePartCategory(dto, userId);
  }

  @RequirePermission(Permission.INVENTORY_READ)
  @Get('spare-parts')
  findSpareParts() {
    return this.catalogService.findSpareParts();
  }

  @RequirePermission(Permission.INVENTORY_WRITE)
  @Post('spare-parts')
  createSparePart(
    @Body() dto: CreateSparePartDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.createSparePart(dto, userId);
  }

  @RequirePermission(Permission.INVENTORY_WRITE)
  @Patch('spare-parts/:id')
  updateSparePart(
    @Param('id') id: string,
    @Body() dto: UpdateSparePartDto,
    @GetUser('sub') userId: string,
  ) {
    return this.catalogService.updateSparePart(id, dto, userId);
  }
}
