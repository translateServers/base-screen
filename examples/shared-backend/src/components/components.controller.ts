import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  ComponentDraftShape,
  ComponentFragmentShape,
  ComponentScreenReference,
} from './component.types';
import { ComponentsService } from './components.service';
import {
  CreateComponentFragmentDto,
  SaveComponentDraftDto,
  UpdateComponentFragmentDto,
} from './dto/component.dto';

/** 原子组件草稿（ADR-0106 D3）：与已发布的 `/material-packages` 分开存。 */
@ApiTags('components')
@Controller('component-drafts')
export class ComponentDraftsController {
  constructor(private readonly components: ComponentsService) {}

  @Get()
  @ApiOperation({ summary: '原子组件草稿列表' })
  async list(): Promise<{ drafts: readonly ComponentDraftShape[] }> {
    return { drafts: await this.components.listDrafts() };
  }

  @Put(':type')
  @ApiOperation({ summary: '保存草稿（新建 revision=0；更新带当前 revision）' })
  @ApiResponse({ status: 409, description: 'REVISION_CONFLICT' })
  async save(
    @Param('type') type: string,
    @Body() dto: SaveComponentDraftDto,
  ): Promise<{ draft: ComponentDraftShape }> {
    return { draft: await this.components.saveDraft(type, dto) };
  }

  @Delete(':type')
  @ApiOperation({ summary: '删除草稿（发布后清理 / 放弃草稿；幂等）' })
  async remove(@Param('type') type: string): Promise<{ deleted: true; type: string }> {
    return this.components.removeDraft(type);
  }
}

/** 组合（ADR-0106 §2.6）：分片定义的持久化。 */
@ApiTags('components')
@Controller('component-fragments')
export class ComponentFragmentsController {
  constructor(private readonly components: ComponentsService) {}

  @Get()
  @ApiOperation({ summary: '组合列表' })
  async list(): Promise<{ fragments: readonly ComponentFragmentShape[] }> {
    return { fragments: await this.components.listFragments() };
  }

  @Post()
  @ApiOperation({ summary: '新建组合（id 取自定义）' })
  @ApiResponse({ status: 409, description: 'COMPONENT_FRAGMENT_EXISTS' })
  async create(
    @Body() dto: CreateComponentFragmentDto,
  ): Promise<{ fragment: ComponentFragmentShape }> {
    return { fragment: await this.components.createFragment(dto) };
  }

  @Put(':id')
  @ApiOperation({ summary: '更新组合（id 不可改，revision 乐观锁）' })
  @ApiResponse({ status: 409, description: 'REVISION_CONFLICT' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateComponentFragmentDto,
  ): Promise<{ fragment: ComponentFragmentShape }> {
    return { fragment: await this.components.updateFragment(id, dto) };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除组合（插入即展开，无引用保护）' })
  async remove(@Param('id') id: string): Promise<{ deleted: true; id: string }> {
    return this.components.removeFragment(id);
  }
}

/** 组件库只读汇总：在线物料被哪些大屏引用（列表引用数、删除前提示）。 */
@ApiTags('components')
@Controller('component-library')
export class ComponentLibraryController {
  constructor(private readonly components: ComponentsService) {}

  @Get('references')
  @ApiOperation({ summary: '在线物料 type → 引用它的大屏' })
  async references(): Promise<{
    references: Readonly<Record<string, readonly ComponentScreenReference[]>>;
  }> {
    return { references: await this.components.references() };
  }
}
