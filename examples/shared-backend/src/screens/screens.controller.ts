import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AlarmBindings } from './alarm-binding-guard';
import { CreateScreenDto } from './dto/create-screen.dto';
import { UpdateAlarmBindingsDto } from './dto/update-alarm-bindings.dto';
import { UpdateScreenDto } from './dto/update-screen.dto';
import type { ScreenShape, ScreenSummaryShape } from './screen.types';
import { ScreensService } from './screens.service';

@ApiTags('screens')
@Controller('screens')
export class ScreensController {
  constructor(private readonly screens: ScreensService) {}

  @Get()
  @ApiOperation({ summary: '大屏列表（不含 document）' })
  async list(): Promise<{ screens: readonly ScreenSummaryShape[] }> {
    return { screens: await this.screens.list() };
  }

  @Post()
  @ApiOperation({ summary: '新建大屏（以起始文档初始化）' })
  async create(@Body() dto: CreateScreenDto): Promise<{ screen: ScreenShape }> {
    return { screen: await this.screens.create(dto.name) };
  }

  @Get(':id')
  @ApiOperation({ summary: '读取单个大屏（含 document）' })
  async get(@Param('id') id: string): Promise<{ screen: ScreenShape }> {
    return { screen: await this.screens.get(id) };
  }

  @Get(':id/alarm-bindings')
  @ApiOperation({ summary: '读取宿主按屏持久化的告警绑定（未配置返回 {}）' })
  async getAlarmBindings(@Param('id') id: string): Promise<{ bindings: AlarmBindings }> {
    return { bindings: await this.screens.getAlarmBindings(id) };
  }

  @Put(':id/alarm-bindings')
  @ApiOperation({ summary: '覆盖宿主按屏持久化的告警绑定' })
  @ApiResponse({ status: 400, description: 'ALARM_BINDINGS_INVALID：结构不合法' })
  async updateAlarmBindings(
    @Param('id') id: string,
    @Body() dto: UpdateAlarmBindingsDto,
  ): Promise<{ bindings: AlarmBindings }> {
    return { bindings: await this.screens.updateAlarmBindings(id, dto.bindings) };
  }

  @Put(':id')
  @ApiOperation({ summary: '保存大屏（revision 乐观锁，成功后 +1）' })
  @ApiResponse({ status: 409, description: 'REVISION_CONFLICT：文档已被其他人更新' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateScreenDto,
  ): Promise<{ screen: ScreenShape }> {
    return { screen: await this.screens.update(id, dto.document, dto.revision) };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除大屏' })
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.screens.remove(id);
    return { ok: true };
  }
}
