export interface FeatureCaseCatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly lookAt: string;
  readonly packages: readonly string[];
  readonly focused: string;
  readonly verify: string;
  readonly stressGrouping: boolean;
}

export const FEATURE_CASE_CATALOG = [
  {
    id: 'canvas',
    title: '画布与官方物料',
    summary: '默认设计器文档：文本、桥接按钮、语义图表与数据集排行卡。',
    lookAt: '画布标题/副标题、React/Vue 桥接、右侧图表与排行卡。',
    packages: ['engine', 'material', 'renderer', 'sdk'],
    focused: 'pnpm --filter @base-screen/engine test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'material-groups',
    title: '物料分组压力',
    summary: '多级分类、超长名称与窄面板浮层。',
    lookAt: '左侧物料库分组标签截断、钻取与分类浮层。',
    packages: ['engine'],
    focused: 'pnpm --filter @base-screen/engine test',
    verify: 'pnpm verify:browser',
    stressGrouping: true,
  },
  {
    id: 'plugin-command',
    title: '插件命令',
    summary: '命令面板触发插件读快照并按选区写回事务。',
    lookAt: '已选中「副标题」。打开命令面板搜索 harness.nudge-selection，或 Ctrl+Shift+P。',
    packages: ['plugin-core', 'plugin-manager', 'engine'],
    focused: 'pnpm --filter @base-screen/plugin-manager test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'plugin-panel',
    title: '插件面板',
    summary: '左栏插件面板 model 回流与带 args 的命令。',
    lookAt: '左侧「Harness panel」：组件数、选区与 Nudge selected by 20。',
    packages: ['plugin-core', 'plugin-manager', 'engine'],
    focused: 'pnpm --filter @base-screen/plugin-core test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'inspector-control',
    title: '检查器自定义控件',
    summary: '已授权 custom 控件写入 props；未授权标签只降级提示。',
    lookAt: '右侧外观面板的语气按钮，以及「副标题（未授权控件）」降级文案。',
    packages: ['plugin-core', 'engine', 'plugin-sdk'],
    focused: 'pnpm --filter @base-screen/engine test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'plugin-material',
    title: '插件物料渲染',
    summary: '外围插件贡献的物料进入目录并真的渲染出第三方图表。',
    lookAt: '画布上的插件 ECharts 图表——它由 plugins/plugin-echarts 声明并带 echarts 依赖。',
    packages: ['plugin-core', 'plugin-manager', 'engine', 'plugin-sdk'],
    focused: 'pnpm --filter @base-screen/plugin-echarts test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'plugin-data-resource',
    title: '插件数据资源类型',
    summary: '插件声明的资源类型授权宿主资源作者入口，未知类型失败关闭。',
    lookAt: '插件指标资源类型 metricsSummary 及其 configSchema（metric/window）。',
    packages: ['plugin-core', 'plugin-manager', 'engine'],
    focused: 'pnpm --filter @base-screen/plugin-metrics test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'plugin-datav-materials',
    title: '插件大屏组件包',
    summary: '零第三方依赖的渲染类插件：四个大屏物料 + 自有检查器控件 + 事务命令。',
    lookAt: '画布上的翻牌器/水位图/轮播列表/装饰边框，以及选中边框后的插件样式选择器。',
    packages: ['plugin-core', 'plugin-manager', 'engine', 'plugin-sdk'],
    focused: 'pnpm --filter @base-screen/plugin-datav-materials test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'dataset',
    title: '数据集排行卡',
    summary: '宿主数据集绑定、字段映射与四态渲染。',
    lookAt: '画布排行卡与右侧数据面板的数据集/字段绑定。',
    packages: ['contracts', 'renderer', 'engine', 'material'],
    focused: 'pnpm --filter @base-screen/renderer test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'semantic-chart',
    title: '语义图表配置',
    summary: 'harness 语义图表演示物料的分组、字段与高级折叠。',
    lookAt: '选中「语义图表」后的右侧外观/数据分区。',
    packages: ['material', 'engine'],
    focused: 'pnpm --filter @base-screen/material test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'blueprint',
    title: 'Blueprint 工作台',
    summary: '画布/交互编排切换；中央图形槽仍归宿主。',
    lookAt: '顶部「交互」工作台与中央 Harness 图形画布的节点摘要。',
    packages: ['engine', 'core', 'sdk'],
    focused: 'pnpm --filter @base-screen/engine test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'host-authoring',
    title: '宿主作者桥',
    summary: 'Shadow DOM 外的宿主面板读请求并提交组件文本。',
    lookAt: '右下角宿主作者面板：编辑 props、提交或取消。',
    packages: ['engine', 'contracts', 'sdk'],
    focused: 'pnpm --filter @base-screen/engine test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
  {
    id: 'variables',
    title: '变量',
    summary: '静态、数据源与 URL 查询变量目录。',
    lookAt: '左侧变量面板中的 count / region / metricValue / urlCampaign。',
    packages: ['engine', 'core', 'contracts'],
    focused: 'pnpm --filter @base-screen/engine test',
    verify: 'pnpm verify:browser',
    stressGrouping: false,
  },
] as const;

export type FeatureCaseId = (typeof FEATURE_CASE_CATALOG)[number]['id'];

export function featureCaseQuery(
  definition: Pick<FeatureCaseCatalogEntry, 'id' | 'stressGrouping'>,
): string {
  const params = new URLSearchParams();
  params.set('designer', '');
  params.set('case', definition.id);
  if (definition.stressGrouping) params.set('material-group-stress', '');
  return `?${params.toString()}`;
}
