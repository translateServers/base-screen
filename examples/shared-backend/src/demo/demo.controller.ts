import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * 演示端点（PRD §12 P2）：仓库里原本**没有**任何「可被测通的 JSON 接口」，
 * 于是「新建 REST 数据源 → 测试连接 → 保存 → 绑定」这条主链路的冒烟没有合法目标，
 * 只能指向外网或留空。这两个端点只服务示例：
 *
 * - `GET /api/demo/press`：12 行冲压压力时序（`t` 日期串 / `device` 文本 / `value` 数字），
 *   覆盖 SQL 模式与 REST 模式的三种常见字段类型；
 * - `GET /api/demo/roster`：6 行值班名单（含 `onDuty` 布尔与 `joinedAt` 日期串），
 *   用来演示 REST 字段推断里的 boolean / date 两种取值类型。
 *
 * 数据是**确定性**的（按序号公式生成，不读时间、不读随机数）：冒烟断言行数与首行内容
 * 时才不会因为「今天是几号」而漂移。
 */

export interface DemoPressRow {
  /** ISO 8601 UTC 时间串。 */
  readonly t: string;
  readonly device: string;
  readonly value: number;
}

export interface DemoRosterRow {
  readonly id: string;
  readonly name: string;
  readonly team: string;
  readonly onDuty: boolean;
  /** ISO 8601 UTC 日期串（契约里 date 类型字段的样例）。 */
  readonly joinedAt: string;
}

/** 12 行：A28 的冒烟目标，行数写死在验收里。 */
const PRESS_ROW_COUNT = 12;
/** 6 行：roster 的固定行数。 */
const ROSTER_ROW_COUNT = 6;

const PRESS_START_MS = Date.UTC(2026, 2, 1, 0, 0, 0);
const PRESS_STEP_MS = 5 * 60 * 1000;

const ROSTER_TEAMS: readonly string[] = ['甲班', '乙班', '丙班'];
const ROSTER_NAMES: readonly string[] = ['张伟', '李静', '王强', '赵敏', '陈晨', '周涛'];

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  @Get('press')
  @ApiOperation({ summary: '演示用冲压压力时序（12 行，确定性数据）' })
  @ApiResponse({ status: 200, description: '12 行 [{t, device, value}]' })
  press(): readonly DemoPressRow[] {
    const rows: DemoPressRow[] = [];
    for (let index = 0; index < PRESS_ROW_COUNT; index += 1) {
      rows.push({
        t: new Date(PRESS_START_MS + index * PRESS_STEP_MS).toISOString(),
        device: index % 2 === 0 ? 'PRESS-01' : 'PRESS-02',
        // 一位小数、范围 70.0–80.9：既不是整数（REAL 列能看出类型），也不会出现浮点尾巴。
        value: Math.round((70 + ((index * 7) % 110) / 10) * 10) / 10,
      });
    }
    return rows;
  }

  @Get('roster')
  @ApiOperation({ summary: '演示用值班名单（6 行，含布尔与日期字段）' })
  @ApiResponse({ status: 200, description: '6 行 [{id, name, team, onDuty, joinedAt}]' })
  roster(): readonly DemoRosterRow[] {
    const rows: DemoRosterRow[] = [];
    for (let index = 0; index < ROSTER_ROW_COUNT; index += 1) {
      rows.push({
        id: `R-${String(index + 1).padStart(3, '0')}`,
        name: ROSTER_NAMES[index] ?? `值班员 ${index + 1}`,
        team: ROSTER_TEAMS[index % ROSTER_TEAMS.length] ?? '甲班',
        onDuty: index % 2 === 0,
        joinedAt: new Date(Date.UTC(2024, 0, 1 + index * 37)).toISOString(),
      });
    }
    return rows;
  }
}
