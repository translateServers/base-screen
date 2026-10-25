import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  SaveMaterialPackageDto,
  SetMaterialPackageVisibilityDto,
  UpdateMaterialPackageDto,
} from './dto/material-package.dto';
import type { MaterialPackageShape } from './material-package.types';
import { MaterialPackagesService } from './material-packages.service';

@ApiTags('material-packages')
@Controller('material-packages')
export class MaterialPackagesController {
  constructor(private readonly packages: MaterialPackagesService) {}

  @Get()
  @ApiOperation({ summary: '在线物料包列表（代码与 Manifest 由宿主生成/审核）' })
  async list(): Promise<{ packages: readonly MaterialPackageShape[] }> {
    return { packages: await this.packages.list() };
  }

  @Post()
  @ApiOperation({ summary: '新建在线物料包（type 必须使用 host.online.*）' })
  @ApiResponse({ status: 409, description: 'MATERIAL_TYPE_EXISTS' })
  async create(@Body() dto: SaveMaterialPackageDto): Promise<{ package: MaterialPackageShape }> {
    return { package: await this.packages.create(dto) };
  }

  @Put(':id')
  @ApiOperation({ summary: '更新在线物料包（type 不可改，revision 乐观锁）' })
  @ApiResponse({ status: 409, description: 'REVISION_CONFLICT / MATERIAL_TYPE_IMMUTABLE' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialPackageDto,
  ): Promise<{ package: MaterialPackageShape }> {
    return { package: await this.packages.update(id, dto) };
  }

  @Patch(':id/visibility')
  @ApiOperation({ summary: '上架/下架（只改 Manifest.libraryVisible，保留代码与 tagName）' })
  async setVisibility(
    @Param('id') id: string,
    @Body() dto: SetMaterialPackageVisibilityDto,
  ): Promise<{ package: MaterialPackageShape }> {
    return { package: await this.packages.setVisibility(id, dto.visible) };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除在线物料包（被大屏引用时 409 + refScreens）' })
  @ApiResponse({ status: 409, description: 'MATERIAL_IN_USE（带 refScreens）' })
  async remove(@Param('id') id: string): Promise<{ deleted: true; id: string }> {
    return this.packages.remove(id);
  }
}
