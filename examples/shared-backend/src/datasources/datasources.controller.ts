import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { DatabaseFileInfo, DatabaseSchemaInfo } from './datasource.types';
import { DatasourceFilesService } from './datasource-files.service';
import type {
  DatasourceDetailShape,
  DatasourceListShape,
  DatasourcePreviewShape,
  DatasourceTestShape,
} from './datasources.service';
import { DatasourcesService } from './datasources.service';
import {
  DatabaseFileParamDto,
  DraftDatasourceDto,
  ListDatasourcesDto,
  SaveDatasourceDto,
} from './dto/datasource.dto';

/**
 * 数据源管理接口（PRD §9.1 #1–#10）。
 *
 * **路由声明顺序是有意义的**：Nest 按声明顺序匹配，`database-files` 必须排在
 * `:datasetId` 之前，否则会被当成一个 datasetId 吞掉（架构 §3.4 明确要求）。
 * 同理 `test` / `preview` 要排在 `:datasetId/test` 之前。
 *
 * 所有业务错误走 `{error, message}`；`POST /test` 与 `POST /preview` 的"连接失败"
 * 不是 HTTP 失败（200 + `ok:false`），否则前端分不清「测试没通过」与「管理接口挂了」。
 */
@ApiTags('datasources')
@Controller('datasources')
export class DatasourcesController {
  constructor(
    private readonly datasources: DatasourcesService,
    private readonly files: DatasourceFilesService,
  ) {}

  @Get()
  @ApiOperation({ summary: '数据源台账：内置 + 自建（自建在前，内置置底）' })
  list(@Query() query: ListDatasourcesDto): Promise<DatasourceListShape> {
    return this.datasources.list(query.type, query.query, query.limit, query.offset);
  }

  @Get('database-files')
  @ApiOperation({ summary: '受管目录内的 .db 文件（只给文件名，排除宿主库）' })
  databaseFiles(): { readonly files: readonly DatabaseFileInfo[] } {
    return { files: this.files.list() };
  }

  @Get('database-files/:name/tables')
  @ApiOperation({ summary: '库文件的表/视图与列（BLOB 列 supported:false）' })
  @ApiParam({ name: 'name', example: 'workshop.db' })
  @ApiResponse({ status: 400, description: 'PATH_NOT_ALLOWED / INVALID_SHAPE' })
  tables(@Param() params: DatabaseFileParamDto): Promise<DatabaseSchemaInfo> {
    return this.files.schema(params.name);
  }

  @Post('test')
  // POST 默认 201，但「测试没通过」不是"创建了什么"：PRD §9.1 #6 要求 200 + ok:false
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '测试草稿配置（不落库；连接失败也 200）' })
  test(@Body() dto: DraftDatasourceDto): Promise<DatasourceTestShape> {
    return this.datasources.testDraft(dto);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预览草稿配置（前 20 行，rowCount 为真实行数）' })
  preview(@Body() dto: DraftDatasourceDto): Promise<DatasourcePreviewShape> {
    return this.datasources.previewDraft(dto);
  }

  @Post()
  @ApiOperation({ summary: '新建数据源（保存即取数一次，失败不阻塞保存）' })
  @ApiResponse({ status: 201, description: '创建成功（status 可能是 error）' })
  @ApiResponse({ status: 409, description: 'DATASOURCE_ID_CONFLICT（带 suggestedId）' })
  create(@Body() dto: SaveDatasourceDto): Promise<DatasourceDetailShape> {
    return this.datasources.create(dto);
  }

  @Get(':datasetId')
  @ApiOperation({ summary: '数据源详情（header 掩码、SQLite 只有文件名）' })
  @ApiParam({ name: 'datasetId', example: 'custom.press-line-a' })
  detail(@Param('datasetId') datasetId: string): Promise<DatasourceDetailShape> {
    return this.datasources.detail(datasetId);
  }

  @Put(':datasetId')
  @ApiOperation({ summary: '编辑数据源（header 传空串或掩码 = 保留原值）' })
  @ApiResponse({ status: 403, description: 'BUILTIN_READONLY' })
  update(
    @Param('datasetId') datasetId: string,
    @Body() dto: SaveDatasourceDto,
  ): Promise<DatasourceDetailShape> {
    return this.datasources.update(datasetId, dto);
  }

  @Delete(':datasetId')
  @ApiOperation({ summary: '删除数据源（被引用 → 409 + refScreens）' })
  @ApiResponse({ status: 409, description: 'DATASOURCE_IN_USE（带 refScreens）' })
  remove(@Param('datasetId') datasetId: string): Promise<{ deleted: true; datasetId: string }> {
    return this.datasources.remove(datasetId);
  }

  @Post(':datasetId/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用已保存配置测试连接（读库内 header 原值并落状态）' })
  testStored(@Param('datasetId') datasetId: string): Promise<DatasourceTestShape> {
    return this.datasources.testStored(datasetId);
  }
}
