import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { CustomDatasetsService } from './custom-datasets.service';
import { DatasetCatalogService } from './dataset-catalog.service';
import { DatasetsController } from './datasets.controller';
import { DatasetsService } from './datasets.service';

/**
 * 数据集模块。
 *
 * - `DatasetsService`：4 个内置数据集（代码常量），**实现一个字未改**；
 * - `CustomDatasetsService`：自建数据源在契约侧的读视图（`ready` 才可见）；
 * - `DatasetCatalogService`：合并 + 参数分发（控制器只转发到这里）。
 *
 * 依赖 `DatasourcesModule` 只为拿到 `DatasourceRuntime`（取数实现与 test/preview 共用一份）；
 * 反向不存在模块依赖，因此没有循环。
 */
@Module({
  imports: [DatasourcesModule],
  controllers: [DatasetsController],
  providers: [DatasetsService, CustomDatasetsService, DatasetCatalogService],
  exports: [DatasetsService, DatasetCatalogService],
})
export class DatasetsModule {}
