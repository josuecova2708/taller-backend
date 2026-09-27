import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';

@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Get()
  findAll() {
    return this.scansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scansService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateScanDto, @Req() req: any) {
    const userId = req.user?.sub;
    return this.scansService.create(dto, userId);
  }
}
