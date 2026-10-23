import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  AIR_QUALITY_DATASET_IDS,
  AIR_QUALITY_DEFAULT_CITY,
} from '../datasets/air-quality-datasets';
import { ensureAirQualityDatabase } from '../sqlite/air-quality-seed';
import { SqliteExecutorService } from '../sqlite/sqlite-executor.service';
import { DATASOURCE_CONFIG_VERSION } from './datasource.types';
import { type CreateExampleInput, DatasourcesService } from './datasources.service';

/**
 * 示例数据源播种（P0-15 / A26）。
 *
 * 目的：数据源管理页第一次打开就**不是空表**——9 行（4 内置 + 2 基础示例 + 3 真实空气质量），
 * 筛选与观感都可验收。
 *
 * 基础示例的取舍（架构 §13 P6）：
 * - `示例 · 压力接口`（REST）**必须是 `draft`**：`onModuleInit` 早于 `listen`，后端还没起监听，
 *   自测自己的 HTTP 端口必然失败；强行播种 `ready` 就是伪造状态。用户点一次「测试连接」
 *   就转正——这也正好演示"测试是必经步骤"。
 * - `示例 · 值班名单`（静态，6 行）是 `ready`：静态数据不需要外部依赖，字段可直接推断，
 *   因此它开箱就能在设计器里被绑定，A2/A26 的"目录里有自定义分组"不依赖任何运行环境。
 *
 * 空气质量三条来自真实快照库 `city-air.db`（见 `sqlite/air-quality-seed.ts`）：库文件在
 * 播种前幂等生成，测试/预览/设计器目录走的都是与用户自建数据源完全相同的只读执行链。
 *
 * 幂等：按 `datasetId` 判断（`custom.example-*` / `custom.air-*`），存在即跳过。
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

const AIR_CITY_PARAMETER = {
  name: 'city',
  label: '城市',
  valueType: 'string' as const,
  required: true,
  defaultValue: AIR_QUALITY_DEFAULT_CITY,
};

/**
 * 三条只读 SQLite 数据源指向同一份真实快照库，按「物料需要的形状」拆开：
 * 实时快照（标量读数）、小时趋势（多行时序）、城市排名（多行榜单）。
 * 拆成三条而不是一条宽查询，是因为标量物料的表格适配器只取第一行，
 * 与趋势图需要的「升序多行」无法共用同一结果集。
 */
export const AIR_EXAMPLES: readonly CreateExampleInput[] = [
  {
    datasetId: AIR_QUALITY_DATASET_IDS.live,
    name: '空气质量 · 城市实时',
    description:
      '真实快照：所选城市的最新 AQI、等级、首要污染物与 24h 优良率。数据来自 Open-Meteo（CAMS）。',
    type: 'sqlite',
    config: {
      v: DATASOURCE_CONFIG_VERSION,
      mode: 'sql',
      file: 'city-air.db',
      sql: `SELECT city AS "城市", province AS "省份", updated_at || ' CST' AS "更新时间", aqi AS "AQI", level AS "等级", "primary" AS "首要污染物", pm2_5 AS "PM2.5", pm10 AS "PM10", ozone AS "O3", no2 AS "NO2", so2 AS "SO2", co AS "CO", printf('%.1f', pm2_5) AS "PM2.5显示", printf('%.1f', pm10) AS "PM10显示", printf('%.1f', ozone) AS "O3显示", printf('%.1f', no2) AS "NO2显示", printf('%.1f', so2) AS "SO2显示", printf('%.2f', co) AS "CO显示", good_ratio AS "优良率", pm25_ratio AS "PM2.5标准比", CASE WHEN pm25_ratio <= 100 THEN '达标' ELSE printf('超标准 %.1f%%', pm25_ratio - 100) END AS "PM2.5状态", advice AS "建议"
FROM city_latest
WHERE city = :city`,
      params: [AIR_CITY_PARAMETER],
    },
    evaluate: true,
  },
  {
    datasetId: AIR_QUALITY_DATASET_IDS.trend,
    name: '空气质量 · 24 小时趋势',
    description: '真实快照：所选城市最近 N 个完整小时的 AQI 与污染物均值，按时间升序返回。',
    type: 'sqlite',
    config: {
      v: DATASOURCE_CONFIG_VERSION,
      mode: 'sql',
      file: 'city-air.db',
      sql: `SELECT "时间", "AQI", "PM2.5", "PM10", "O3"
FROM (
  SELECT time AS "时间", aqi AS "AQI", pm2_5 AS "PM2.5", pm10 AS "PM10", ozone AS "O3"
  FROM city_hourly
  WHERE city = :city
  ORDER BY time DESC
  LIMIT :hours
) AS recent
ORDER BY "时间" ASC`,
      params: [
        AIR_CITY_PARAMETER,
        {
          name: 'hours',
          label: '小时数',
          valueType: 'number',
          required: true,
          defaultValue: 24,
        },
      ],
    },
    evaluate: true,
  },
  {
    datasetId: AIR_QUALITY_DATASET_IDS.rank,
    name: '空气质量 · 城市排名',
    description: '真实快照：8 个重点城市按当前 AQI 降序排名，供榜单与柱图共用。',
    type: 'sqlite',
    config: {
      v: DATASOURCE_CONFIG_VERSION,
      mode: 'sql',
      file: 'city-air.db',
      sql: `SELECT ROW_NUMBER() OVER (ORDER BY aqi DESC, city ASC) AS rank, city, aqi AS "AQI", level, "primary"
FROM city_latest
ORDER BY aqi DESC, city ASC
LIMIT :limit`,
      params: [
        {
          name: 'limit',
          label: '返回城市数',
          valueType: 'number',
          required: true,
          defaultValue: 8,
        },
      ],
    },
    evaluate: true,
  },
];

@Injectable()
export class DatasourceSeedService implements OnModuleInit {
  private readonly logger = new Logger(DatasourceSeedService.name);

  constructor(
    private readonly datasources: DatasourcesService,
    private readonly sqlite: SqliteExecutorService,
  ) {}

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
    try {
      if (await ensureAirQualityDatabase(this.sqlite)) {
        this.logger.log('已生成空气质量快照库 city-air.db');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`空气质量快照库生成失败，跳过三个空气质量数据源：${message}`);
      return created;
    }
    for (const example of AIR_EXAMPLES) {
      if (await this.datasources.createExample(example)) created += 1;
    }
    return created;
  }
}
