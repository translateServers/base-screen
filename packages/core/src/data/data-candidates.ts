import type { ScreenDatasetValueType } from '@base-screen/contracts';
import type { ScreenDatasetProfile, ScreenFieldProfile } from './dataset-profile.js';
import type { ScreenDataBindingRole } from './value-ref.js';

/**
 * 事实类型与候选枚举（ADR-0114 §2.3）：字段画像 × 物料绑定角色 → 合法的（事实, 物料, 角色绑定）。
 *
 * 先枚举再挑选：模型只在这里给出的合法候选里挑，不自由写绑定。
 * 本阶段只做不需要行间计算的事实——数据集端口不做聚合，Base Screen 也不替宿主算口径：
 * - 明细级数据（`grain.unique` 为假）只出 Detail 与 Value；
 * - 差值 / 环比、极值、异常、分布不做。
 *
 * 角色分配只看物料声明的 `valueTypes` 与数量上下限，不按角色 id 猜。
 */

export type ScreenDataFact =
  | 'value'
  | 'trend'
  | 'categorization'
  | 'proportion'
  | 'rank'
  | 'association'
  | 'detail';

export interface ScreenCandidateMaterial {
  readonly type: string;
  readonly name: string;
  readonly roles: readonly ScreenDataBindingRole[];
}

export interface ScreenDataCandidate {
  /** 本轮候选表里的编号：`c1`、`c2`……按数据集顺序、再按得分排。 */
  readonly id: string;
  readonly fact: ScreenDataFact;
  readonly datasetId: string;
  readonly type: string;
  /** 角色 id → 字段 id，可直接写进 `dataBinding.fields`。 */
  readonly fields: Readonly<Record<string, readonly string[]>>;
  readonly score: number;
}

export interface EnumerateScreenDataCandidatesOptions {
  /** 每个数据集最多保留的候选数，缺省 12。 */
  readonly maxPerDataset?: number;
}

/** 分类与排名的分界：维度取值不超过它算分类，超过算排名。 */
export const SCREEN_CATEGORY_MAX = 12;
/** 占比的维度取值上限。 */
export const SCREEN_PROPORTION_MAX = 8;

const FACT_ORDER: readonly ScreenDataFact[] = [
  'value',
  'trend',
  'categorization',
  'proportion',
  'rank',
  'association',
  'detail',
];

const FACT_BASE: Readonly<Record<ScreenDataFact, number>> = {
  value: 60,
  trend: 50,
  categorization: 45,
  rank: 42,
  proportion: 40,
  association: 30,
  detail: 10,
};

/** 物料偏好：type 或名称命中时加分。命中不了就只按角色匹配，得分退化为事实优先级。 */
const PREFERENCE: readonly { readonly fact: ScreenDataFact; readonly pattern: RegExp }[] = [
  { fact: 'trend', pattern: /line|area|trend|折线|面积|趋势/i },
  { fact: 'categorization', pattern: /bar|column|柱|条形/i },
  { fact: 'rank', pattern: /bar|rank|排名|排行|条形/i },
  { fact: 'proportion', pattern: /pie|donut|ring|饼|环/i },
  { fact: 'association', pattern: /scatter|bubble|散点|气泡/i },
  { fact: 'detail', pattern: /table|grid|list|表格|列表|明细/i },
  { fact: 'value', pattern: /text|kpi|metric|number|文本|指标|数字/i },
];

interface FieldPlan {
  readonly axis?: ScreenFieldProfile;
  readonly measures: readonly ScreenFieldProfile[];
  /** 至少要用上几个度量。 */
  readonly minMeasures: number;
}

export function enumerateScreenDataCandidates(
  profiles: readonly ScreenDatasetProfile[],
  materials: readonly ScreenCandidateMaterial[],
  options: EnumerateScreenDataCandidatesOptions = {},
): ScreenDataCandidate[] {
  const limit = options.maxPerDataset ?? 12;
  const output: ScreenDataCandidate[] = [];
  for (const profile of profiles) {
    const found: Omit<ScreenDataCandidate, 'id'>[] = [];
    for (const [fact, plan] of factPlans(profile)) {
      for (const material of materials) {
        const fields =
          fact === 'detail' ? assignDetail(material, profile) : assignPlan(material, plan);
        if (fields === null) continue;
        // 关联要散点一类的物料：普通图表也能把一个度量放进维度角色，但那画出来是把数值当类别。
        if (fact === 'association' && !isPreferred(fact, material)) continue;
        found.push({
          fact,
          datasetId: profile.datasetId,
          type: material.type,
          fields,
          score: scoreOf(fact, material),
        });
      }
    }
    const unique = dedupe(found);
    unique.sort(
      (a, b) =>
        b.score - a.score ||
        FACT_ORDER.indexOf(a.fact) - FACT_ORDER.indexOf(b.fact) ||
        compareText(a.type, b.type),
    );
    // 同分同类型时保持生成顺序（字段声明顺序）：`Array.prototype.sort` 是稳定排序。
    for (const candidate of unique.slice(0, limit)) {
      output.push({ id: `c${output.length + 1}`, ...candidate });
    }
  }
  return output;
}

/** 按画像列出每种事实要用的字段（一种事实可能有多份计划，例如每个度量各一份）。 */
function factPlans(profile: ScreenDatasetProfile): [ScreenDataFact, FieldPlan][] {
  const plans: [ScreenDataFact, FieldPlan][] = [];
  if (!profile.sampled || profile.rows.sampled === 0) {
    plans.push(['detail', { measures: [], minMeasures: 0 }]);
    return plans;
  }
  const measures = profile.fields.filter((field) => field.kind === 'measure');
  const times = profile.fields.filter((field) => field.kind === 'time');
  const dimensions = profile.fields.filter((field) => field.kind === 'dimension');
  const singleRow =
    profile.rows.sampled === 1 && (profile.rows.total === undefined || profile.rows.total <= 1);

  // Value：只给单行结果——文本物料只读第一行（ADR-0114 §8.1 ②）。
  if (singleRow) {
    for (const measure of measures) plans.push(['value', { measures: [measure], minMeasures: 1 }]);
  }

  const keyedBy = (field: ScreenFieldProfile) =>
    profile.grain.unique && profile.grain.keys.length === 1 && profile.grain.keys[0] === field.id;

  for (const time of times) {
    if (!keyedBy(time) || profile.rows.sampled < 3) continue;
    for (const measure of measures) {
      plans.push(['trend', { axis: time, measures: [measure], minMeasures: 1 }]);
    }
  }
  for (const dimension of dimensions) {
    if (!keyedBy(dimension)) continue;
    const many = dimension.distinct > SCREEN_CATEGORY_MAX;
    for (const measure of measures) {
      plans.push([
        many ? 'rank' : 'categorization',
        { axis: dimension, measures: [measure], minMeasures: 1 },
      ]);
      if (
        !many &&
        dimension.distinct <= SCREEN_PROPORTION_MAX &&
        measure.number?.nonNegative === true
      ) {
        plans.push(['proportion', { axis: dimension, measures: [measure], minMeasures: 1 }]);
      }
    }
  }
  if (profile.rows.sampled >= 10 && measures.length >= 2) {
    plans.push(['association', { measures: measures.slice(0, 2), minMeasures: 2 }]);
  }
  plans.push(['detail', { measures: [], minMeasures: 0 }]);
  return plans;
}

/**
 * 按物料角色的声明顺序分配：横轴（时间 / 维度）落到第一个接受其类型、且不是「只收数值」的角色，
 * 度量依次落到接受数值的角色，每个角色不超过上限；任何一个角色凑不够下限就判不合法。
 */
function assignPlan(
  material: ScreenCandidateMaterial,
  plan: FieldPlan,
): Record<string, string[]> | null {
  if (material.roles.length === 0) return null;
  let axis = plan.axis;
  const measures = [...plan.measures];
  let usedMeasures = 0;
  const binding: Record<string, string[]> = {};
  for (const role of material.roles) {
    const picked: string[] = [];
    if (axis !== undefined && accepts(role, axis.valueType) && !numberOnly(role)) {
      picked.push(axis.id);
      axis = undefined;
    } else {
      while (picked.length < role.maxFields && measures.length > 0 && accepts(role, 'number')) {
        picked.push(measures.shift()!.id);
        usedMeasures += 1;
      }
    }
    if (picked.length < role.minFields) return null;
    if (picked.length > 0) binding[role.id] = picked;
  }
  if (axis !== undefined || usedMeasures < plan.minMeasures || measures.length > 0) return null;
  return binding;
}

/** 明细：只有一个必填角色、能收下全部字段类型、且至少能放两列的物料（表格类）。 */
function assignDetail(
  material: ScreenCandidateMaterial,
  profile: ScreenDatasetProfile,
): Record<string, string[]> | null {
  if (material.roles.length !== 1) return null;
  const role = material.roles[0]!;
  if (role.maxFields < 2) return null;
  const fields = profile.fields.filter((field) => field.kind !== 'empty');
  if (fields.length < role.minFields) return null;
  if (!fields.every((field) => accepts(role, field.valueType))) return null;
  return { [role.id]: fields.slice(0, role.maxFields).map((field) => field.id) };
}

function accepts(role: ScreenDataBindingRole, valueType: ScreenDatasetValueType): boolean {
  return role.valueTypes.includes(valueType);
}

function numberOnly(role: ScreenDataBindingRole): boolean {
  return role.valueTypes.length === 1 && role.valueTypes[0] === 'number';
}

function isPreferred(fact: ScreenDataFact, material: ScreenCandidateMaterial): boolean {
  return PREFERENCE.some(
    (entry) =>
      entry.fact === fact &&
      (entry.pattern.test(material.type) || entry.pattern.test(material.name)),
  );
}

function scoreOf(fact: ScreenDataFact, material: ScreenCandidateMaterial): number {
  return FACT_BASE[fact] + (isPreferred(fact, material) ? 10 : 0);
}

function dedupe(items: Omit<ScreenDataCandidate, 'id'>[]): Omit<ScreenDataCandidate, 'id'>[] {
  const seen = new Set<string>();
  const output: Omit<ScreenDataCandidate, 'id'>[] = [];
  for (const item of items) {
    const key = JSON.stringify([item.fact, item.type, item.fields]);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
