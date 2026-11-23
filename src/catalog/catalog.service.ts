import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // --------------------------------------------------------------------------
  // 1. Estructura Organizacional Recursiva (Rectorado -> Facultad -> Unidad)
  // --------------------------------------------------------------------------
  async findOrganizationalUnits() {
    return this.prisma.organizationalUnit.findMany({
      where: { active: true },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true, type: true } },
        _count: { select: { users: true, vehicles: true, children: true } },
      },
    });
  }

  async createOrganizationalUnit(dto: CreateOrganizationalUnitDto, actorId?: string) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.organizationalUnit.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Ya existe una unidad organizacional con el código ${code}.`);
    }

    const created = await this.prisma.organizationalUnit.create({
      data: {
        name: dto.name.trim(),
        code,
        type: dto.type?.trim().toUpperCase() || 'FACULTAD',
        parentId: dto.parentId || null,
      },
      include: { parent: { select: { id: true, name: true, code: true } } },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'ORGANIZATIONAL_UNIT',
      entityId: created.id,
      summary: `Unidad organizacional creada: ${created.name} (${created.code})`,
    });

    return created;
  }

  // --------------------------------------------------------------------------
  // 2. Clasificación Jerárquica de Vehículos (Categoría -> Marca -> Modelo)
  // --------------------------------------------------------------------------
  async findVehicleCategories() {
    return this.prisma.vehicleCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { vehicles: true, models: true } } },
    });
  }

  async createVehicleCategory(dto: CreateVehicleCategoryDto, actorId?: string) {
    const name = dto.name.trim();
    const existing = await this.prisma.vehicleCategory.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException(`Ya existe la categoría vehicular "${name}".`);
    }

    const created = await this.prisma.vehicleCategory.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        inspectionCycleDays: dto.inspectionCycleDays ?? 30,
      },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'VEHICLE_CATEGORY',
      entityId: created.id,
      summary: `Categoría de vehículo registrada: ${created.name}`,
    });

    return created;
  }

  async findVehicleBrands() {
    return this.prisma.vehicleBrand.findMany({
      orderBy: { name: 'asc' },
      include: {
        models: {
          orderBy: { name: 'asc' },
          include: { category: { select: { id: true, name: true } } },
        },
        _count: { select: { models: true } },
      },
    });
  }

  async createVehicleBrand(dto: CreateVehicleBrandDto, actorId?: string) {
    const name = dto.name.trim();
    const existing = await this.prisma.vehicleBrand.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException(`Ya existe la marca "${name}".`);
    }

    const created = await this.prisma.vehicleBrand.create({
      data: {
        name,
        countryOrigin: dto.countryOrigin?.trim() || 'Japón',
      },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'VEHICLE_BRAND',
      entityId: created.id,
      summary: `Marca de vehículo registrada: ${created.name}`,
    });

    return created;
  }

  async findVehicleModels() {
    return this.prisma.vehicleModel.findMany({
      orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
      include: {
        brand: { select: { id: true, name: true, countryOrigin: true } },
        category: { select: { id: true, name: true, inspectionCycleDays: true } },
        _count: { select: { vehicles: true } },
      },
    });
  }

  async createVehicleModel(dto: CreateVehicleModelDto, actorId?: string) {
    const name = dto.name.trim();
    const existing = await this.prisma.vehicleModel.findUnique({
      where: { brandId_name: { brandId: dto.brandId, name } },
    });
    if (existing) {
      throw new ConflictException(`Ya existe el modelo "${name}" para esa marca.`);
    }

    const created = await this.prisma.vehicleModel.create({
      data: {
        brandId: dto.brandId,
        categoryId: dto.categoryId || null,
        name,
        engineType: dto.engineType?.trim().toUpperCase() || 'GASOLINA',
        displacement: dto.displacement?.trim() || null,
      },
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'VEHICLE_MODEL',
      entityId: created.id,
      summary: `Modelo vehicular registrado: ${created.brand.name} ${created.name}`,
    });

    return created;
  }

  // --------------------------------------------------------------------------
  // 3. Especialidades Técnicas de Mecánicos
  // --------------------------------------------------------------------------
  async findSpecialties() {
    return this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { mechanics: true } } },
    });
  }

  async createSpecialty(dto: CreateSpecialtyDto, actorId?: string) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.specialty.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Ya existe una especialidad con el código ${code}.`);
    }

    const created = await this.prisma.specialty.create({
      data: {
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'SPECIALTY',
      entityId: created.id,
      summary: `Especialidad técnica creada: ${created.name} (${created.code})`,
    });

    return created;
  }

  // --------------------------------------------------------------------------
  // 4. Catálogo Técnico OBD-II (Sistemas y Códigos DTC)
  // --------------------------------------------------------------------------
  async findObdCatalog() {
    const [systems, dtcs] = await Promise.all([
      this.prisma.obdSystem.findMany({
        orderBy: { prefix: 'asc' },
        include: { _count: { select: { dtcCatalog: true } } },
      }),
      this.prisma.dtcCatalog.findMany({
        orderBy: { code: 'asc' },
        include: {
          system: { select: { prefix: true, name: true } },
          _count: { select: { dtcEntries: true } },
        },
      }),
    ]);

    return { systems, dtcs };
  }

  // --------------------------------------------------------------------------
  // 5. Inventario de Repuestos e Insumos (SparePartCategory -> SparePart)
  // --------------------------------------------------------------------------
  async findSparePartCategories() {
    return this.prisma.sparePartCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { parts: true } } },
    });
  }

  async createSparePartCategory(dto: CreateSparePartCategoryDto, actorId?: string) {
    const name = dto.name.trim();
    const existing = await this.prisma.sparePartCategory.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException(`Ya existe la categoría de repuesto "${name}".`);
    }

    const created = await this.prisma.sparePartCategory.create({
      data: {
        name,
        description: dto.description?.trim() || null,
      },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'SPARE_PART_CATEGORY',
      entityId: created.id,
      summary: `Categoría de repuestos creada: ${created.name}`,
    });

    return created;
  }

  async findSpareParts() {
    return this.prisma.sparePart.findMany({
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { ordersUsed: true } },
      },
    });
  }

  async createSparePart(dto: CreateSparePartDto, actorId?: string) {
    const sku = dto.sku.trim().toUpperCase();
    const existing = await this.prisma.sparePart.findUnique({ where: { sku } });
    if (existing) {
      throw new ConflictException(`Ya existe un repuesto registrado con el SKU ${sku}.`);
    }

    const created = await this.prisma.sparePart.create({
      data: {
        categoryId: dto.categoryId,
        sku,
        name: dto.name.trim(),
        brand: dto.brand?.trim() || null,
        unitCost: dto.unitCost ?? 0,
        stock: dto.stock ?? 0,
        minStock: dto.minStock ?? 2,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'SPARE_PART',
      entityId: created.id,
      summary: `Repuesto registrado en inventario: ${created.name} (${created.sku}) — Stock inicial: ${created.stock}`,
    });

    return created;
  }

  async updateSparePart(id: string, dto: UpdateSparePartDto, actorId?: string) {
    const existing = await this.prisma.sparePart.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('El repuesto indicado no existe.');
    }

    const updated = await this.prisma.sparePart.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.brand !== undefined ? { brand: dto.brand?.trim() || null } : {}),
        ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
        ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
        ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { category: { select: { id: true, name: true } } },
    });

    void this.auditService.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'SPARE_PART',
      entityId: updated.id,
      summary: `Inventario actualizado para ${updated.name} (${updated.sku}) — Stock: ${updated.stock}`,
    });

    return updated;
  }
}
