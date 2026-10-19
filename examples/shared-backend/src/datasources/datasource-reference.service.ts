import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 数据源引用关系（架构 §5 / PRD A9–A11）。
 *
 * 数据来源是 `Screen.document`（canonical JSON 字符串）里每个组件的
 * `dataSource: { type:'dataset', datasetId, params, binding }`。`params` 里引用的是
 * **变量**（`{kind:'variable', variableId}`），不是数据源，所以扫描只认 `datasetId`。
 *
 * 三条纪律：
 * 1. **不做 TTL 缓存**：A9/A10 会在「刚建完大屏就查引用」的时序上断言，任何缓存窗口都会
 *    造成假失败；示例量级（屏数 × 单文档 ≤ 2 MiB）毫秒级，不值得换这些坑。
 * 2. **一次扫描服务整页**：列表页每行都查引用会变成 N 次全表扫描。
 * 3. **同屏多次引用只记一次**：`refCount` 是「有多少张大屏在用」，不是「绑了几次」。
 */

export interface ScreenReference {
  readonly id: string;
  readonly name: string;
  /** ISO 8601 UTC。 */
  readonly updatedAt: string;
}

export type ReferenceIndex = ReadonlyMap<string, readonly ScreenReference[]>;

/**
 * 从一份 canonical Screen Document 里抽出被引用的 datasetId（去重、保持出现顺序）。
 *
 * 纯函数，容错优先：文档可能来自旧版本/被手改，解析失败就当作「没有引用」而不是抛错
 * ——列表页不该因为一张坏文档整体 500（删除保护因此在坏文档上"少挡一次"，但坏文档
 * 本身已经无法打开，属于可接受的方向）。
 */
export function extractDatasetIds(document: string): readonly string[] {
  // 子串剪枝：绝大多数屏不接数据源，直接跳过 JSON.parse
  if (document.includes('"dataset"') === false) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== 'object') return [];
  const components = (parsed as { components?: unknown }).components;
  if (Array.isArray(components) === false) return [];
  const ids: string[] = [];
  for (const component of components) {
    if (component === null || typeof component !== 'object') continue;
    const dataSource = (component as { dataSource?: unknown }).dataSource;
    if (dataSource === null || typeof dataSource !== 'object') continue;
    const record = dataSource as { type?: unknown; datasetId?: unknown };
    if (record.type !== 'dataset') continue;
    if (typeof record.datasetId !== 'string' || record.datasetId === '') continue;
    if (ids.includes(record.datasetId)) continue;
    ids.push(record.datasetId);
  }
  return ids;
}

@Injectable()
export class DatasourceReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全量扫描一次，得到 `datasetId → 引用它的屏` 的索引。 */
  async collect(): Promise<ReferenceIndex> {
    const screens = await this.prisma.screen.findMany({
      select: { id: true, name: true, updatedAt: true, document: true },
    });
    const index = new Map<string, ScreenReference[]>();
    for (const screen of screens) {
      const reference: ScreenReference = {
        id: screen.id,
        name: screen.name,
        updatedAt: screen.updatedAt.toISOString(),
      };
      for (const datasetId of extractDatasetIds(screen.document)) {
        const existing = index.get(datasetId);
        if (existing === undefined) {
          index.set(datasetId, [reference]);
          continue;
        }
        existing.push(reference);
      }
    }
    return index;
  }

  /** 单个数据源的引用清单（详情与删除前校验用）。 */
  async find(datasetId: string): Promise<readonly ScreenReference[]> {
    const index = await this.collect();
    return index.get(datasetId) ?? [];
  }
}
