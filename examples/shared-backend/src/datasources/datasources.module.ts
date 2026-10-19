import { Module } from '@nestjs/common';
import { SqliteModule } from '../sqlite/sqlite.module';
import { DatasourceFilesService } from './datasource-files.service';
import { DatasourceReferenceService } from './datasource-reference.service';
import { DatasourceRuntime } from './datasource-runtime';
import { DatasourceSeedService } from './datasource-seed.service';
import { DatasourcesController } from './datasources.controller';
import { DatasourcesService } from './datasources.service';

/**
 * 数据源管理模块。
 *
 * 导出四样东西给契约侧（`DatasetsModule`）复用：
 * - `DatasourceRuntime`：test / preview / 已存测试 / 设计器查询**同一份取数实现**；
 * - `DatasourcesService`：播种（`DatasourceSeedService`）与后续可能的联动；
 * - `DatasourceReferenceService` / `DatasourceFilesService`：引用统计与受管目录。
 *
 * 依赖方向是单向的：`DatasetsModule → DatasourcesModule`。反向只有对**纯函数文件**
 * （`dataset-definitions.ts` / `dataset-inference.ts`）的直接 import，不构成模块环。
 */
@Module({
  imports: [SqliteModule],
  controllers: [DatasourcesController],
  providers: [
    DatasourceRuntime,
    DatasourceFilesService,
    DatasourceReferenceService,
    DatasourcesService,
    DatasourceSeedService,
  ],
  exports: [
    DatasourceRuntime,
    DatasourceFilesService,
    DatasourceReferenceService,
    DatasourcesService,
  ],
})
export class DatasourcesModule {}
