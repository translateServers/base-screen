import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DATASOURCE_CONFIG_VERSION } from './datasource.types';
import { type CreateExampleInput, DatasourcesService } from './datasources.service';

/**
 * 示例数据源播种（P0-15 / A26）。
 *
 * 目的：数据源管理页第一次打开就**不是空表**——6 行（4 内置 + 2 示例），筛选与观感都可验收。
 *
 * 两条示例的取舍（架构 §13 P6）：
 * - `示例 · 压力接口`（REST）**必须是 `draft`**：`onModuleInit` 早于 `listen`，后端还没起监听，
 *   自测自己的 HTTP 端口必然失败；强行播种 `ready` 就是伪造状态。用户点一次「测试连接」
 *   就转正——这也正好演示"测试是必经步骤"。
 * - `示例 · 值班名单`（静态，6 行）是 `ready`：静态数据不需要外部依赖，字段可直接推断，
 *   因此它开箱就能在设计器里被绑定，A2/A26 的"目录里有自定义分组"不依赖任何运行环境。
 *
 * 幂等：按 `datasetId` 判断（`custom.example-press` / `custom.example-roster`），存在即跳过。
 * 用固定 id 而不是 slug 生成，是为了不占用用户名的 `custom.ds-<n>` 序号。
 */

const PRESS_EXAMPLE: CreateExampleInput = {
  datasetId: 'custom.example-press',
  name: '示例 · 压力接口',
  description: '后端内置的演示 REST 接口（12 行时序数据）。点「测试连接」即可转为就绪。',
  type: 'rest',
  config: {
    v: DATASOURCE_CONFIG_VERSION,
    url: 'http://127.0.0.1:3000/api/demo/press',
    headers: [],
    params: [],
  },
  evaluate: false,
};

const ROSTER_EXAMPLE: CreateExampleInput = {
  datasetId: 'custom.example-roster',
  name: '示例 · 值班名单',
  description: '静态 JSON 示例：6 行值班名单，含布尔与日期字段，开箱即可在设计器里绑定。',
  type: 'static',
  config: {
    v: DATASOURCE_CONFIG_VERSION,
    columns: ['crew', 'leader', 'onDuty', 'shiftStart'],
    rows: [
      ['甲班', '张伟', true, '2026-03-01T08:00:00.000Z'],
      ['甲班', '李静', false, '2026-03-01T16:00:00.000Z'],
      ['乙班', '王强', true, '2026-03-01T00:00:00.000Z'],
      ['乙班', '赵敏', false, '2026-03-01T08:00:00.000Z'],
      ['丙班', '陈晨', true, '2026-03-01T16:00:00.000Z'],
      ['丙班', '周涛', false, '2026-03-02T00:00:00.000Z'],
    ],
  },
  evaluate: true,
};

@Injectable()
export class DatasourceSeedService implements OnModuleInit {
  private readonly logger = new Logger(DatasourceSeedService.name);

  constructor(private readonly datasources: DatasourcesService) {}

  async onModuleInit(): Promise<void> {
    // 测试用开关：e2e 需要一张确定的空表（A1 的 items.length = 4 + 自建数 才对得上）
    if (process.env.DATASOURCE_SEED === '0') return;
    try {
      await this.ensureSeed();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`示例数据源播种失败（不影响启动）：${message}`);
    }
  }

  /** 幂等播种；返回本次实际创建的条数（便于单测断言）。 */
  async ensureSeed(): Promise<number> {
    let created = 0;
    if (await this.datasources.createExample(PRESS_EXAMPLE)) created += 1;
    if (await this.datasources.createExample(ROSTER_EXAMPLE)) created += 1;
    return created;
  }
}
