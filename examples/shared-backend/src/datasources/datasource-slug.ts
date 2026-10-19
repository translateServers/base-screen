/**
 * `datasetId` 生成规则（PRD §8.2）——后端侧的唯一实现。
 *
 * 规则（可断言）：
 * - 名称里**有**可用字符（`[a-z0-9]` 经小写、非字母数字转 `-`、连续折叠、去首尾之后非空）
 *   → `custom.<slug>`。例：`Press Line A` → `custom.press-line-a`。
 * - 名称里**没有**可用字符（纯中文、纯符号）→ `custom.ds-<序号>`。序号与名称无关，
 *   取「当前自建数据源序号 + 1」，保证可预测。**不做拼音转换**：拼音需要几千字的汉字表，
 *   与「示例工程零新增依赖」冲突，且转出来的 id 用户也读不懂。
 * - 冲突时**不自动加后缀**（P8）：`custom.press-line-a` 已存在就返回 409，建议名由
 *   `suggestDatasetId` 算给用户确认。自动加后缀会让「我填的名字」和「实际存的名字」
 *   静默分叉，之后在大屏文档里按 datasetId 排查引用时对不上。
 *
 * 前端三端 `src/lib/datasource-model.ts` 里有**逐字节等价**的实现（抽屉需要实时预览
 * datasetId），两侧由根测试 `tests/examples/datasource-parity.test.ts` 用同一张 fixture
 * 表断言，因此任何一侧改规则都会红。
 */

/** 自建数据源的前缀：宿主文档 schema 对 `datasetId` 只要求 1..256 字，`custom.*` 无需改基座。 */
export const CUSTOM_DATASET_ID_PREFIX = 'custom.';

/** 无可用字符时的兜底前缀（`custom.ds-<n>`）。 */
export const GENERATED_DATASET_ID_PREFIX = `${CUSTOM_DATASET_ID_PREFIX}ds-`;

/**
 * 名称 → slug：只保留 `[a-z0-9]`，其余字符段折叠成单个 `-`，去掉首尾 `-`。
 *
 * 用 `[^a-z0-9]+` 一次替换（而不是逐字符），是为了让「连续的非字母数字」只产生一个
 * 连字符：`A //  B` → `a-b` 而不是 `a---b`。
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * 生成 datasetId。
 *
 * @param name 用户填的名称（1..64 字）。
 * @param nextSequence 当前自建数据源序号 + 1（从 1 开始）；只在 slug 为空时使用。
 */
export function buildCustomDatasetId(name: string, nextSequence: number): string {
  const slug = slugifyName(name);
  if (slug !== '') return `${CUSTOM_DATASET_ID_PREFIX}${slug}`;
  return `${GENERATED_DATASET_ID_PREFIX}${normalizeSequence(nextSequence)}`;
}

/**
 * 冲突时的建议名：在 candidate 后面依次尝试 `-2`、`-3`… 直到未被占用。
 *
 * 只用于 409 响应里的 `suggestedDatasetId`——**不**自动采用，用户改了名再提交。
 */
export function suggestDatasetId(
  candidate: string,
  isTaken: (datasetId: string) => boolean,
): string {
  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const next = `${candidate}-${suffix}`;
    if (!isTaken(next)) return next;
  }
  return `${candidate}-99`;
}

/** 序号归一：正整数，否则回落 1（序号来自 `count(*)`，防御性处理不是死代码）。 */
function normalizeSequence(sequence: number): number {
  if (!Number.isFinite(sequence)) return 1;
  const truncated = Math.trunc(sequence);
  return truncated >= 1 ? truncated : 1;
}
