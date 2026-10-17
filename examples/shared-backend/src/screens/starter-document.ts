import { validateScreenDocumentInput } from './screen-document-guard';

/**
 * 新建大屏使用的起始文档（canonical Screen Document 形状的普通 JSON）。
 *
 * 这张卡片**不是一整个物料**，而是四个原子物料按 zIndex 叠出来的：`base.rectangle` 做底座与
 * 边框，`base.text` 做标题，`base.rule` 做分隔线，`host-app.metric-value` 只画「数值 + 单位」。
 * 需要成套搬运这份组合时，宿主用 `insertComponentFragment` 一次插入。
 *
 * 四个节点**刻意都是根节点**，不是挂在底座下的父子结构：宿主配置 `groupMaterialType` 之后，
 * 组壳的几何由引擎持有——任何一次事务都会把 `base.container` 吸附到其子孙的包围盒并集
 * （auto-width 文本的实测宽度变化不产生事务，只能靠下一次事务顺带同步）。把底座当父节点，
 * 20px 内缩会在第一次无关编辑时被压平。"整体搬动"是编辑期的**成组**动作，不是文档层的父子关系。
 *
 * - `stage-card-value` 演示 host-resource 数据绑定：`resourceType: 'demo_metric'`、
 *   `resourceId: 'cpu_usage'`，参数 `points` 为字面量。该组件使用三个前端各自实现的
 *   同一个宿主自有物料 `host-app.metric-value`（原生自定义元素 / React 组件 / Vue SFC，
 *   manifest 完全一致），其 `dataCapabilities` 声明 `host-resource` 并带表格适配器；
 *   前端宿主数据通道（resourcePort）把 resourceId 解析成一次 mock 指标查询。
 *   官方物料里只有 `base.image` 支持宿主资源，所以
 *   「绑宿主资源的读数」本身就是宿主自有物料的位置。
 * - `binding.fields` 的键是物料 dataBinding 的角色 id（指标读数的角色为 `value`）。
 *
 * 该形状与 `packages/contracts` 的 canonical schema 一致，但后端不依赖契约包来判断
 * 这一点：只在写入时做有界结构校验，权威校验发生在宿主前端与设计器提交路径上。
 */
const STARTER_DOCUMENT = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#0b1020' },
  components: [
    {
      id: 'stage-bg',
      type: 'base.rectangle',
      name: '背景',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1080 },
      rotation: 0,
      zIndex: 1,
      status: { locked: true, hidden: false },
      props: {},
      style: { fill: '#0b1020', borderColor: '#1f2a44', borderWidth: 0, opacity: 1 },
      dataSource: null,
    },
    {
      id: 'stage-title',
      type: 'base.text',
      name: '标题',
      parentId: null,
      position: { x: 64, y: 48 },
      size: { width: 900, height: 64 },
      rotation: 0,
      zIndex: 2,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#e8eefb', fontSize: 40, fontWeight: '700', textAlign: 'left' },
      dataSource: { type: 'static', value: '销售运营大屏' },
    },
    {
      id: 'stage-card-bg',
      type: 'base.rectangle',
      name: '卡片底座',
      parentId: null,
      position: { x: 64, y: 140 },
      size: { width: 260, height: 120 },
      rotation: 0,
      zIndex: 3,
      status: { locked: false, hidden: false },
      props: {},
      style: { fill: '#111a30', borderColor: '#1f2a44', borderWidth: 1, opacity: 1 },
      dataSource: null,
    },
    {
      id: 'stage-card-title',
      type: 'base.text',
      name: '卡片标题',
      parentId: null,
      position: { x: 84, y: 152 },
      size: { width: 220, height: 22 },
      rotation: 0,
      zIndex: 4,
      status: { locked: false, hidden: false },
      props: {},
      style: {
        color: '#93a4c3',
        fontSize: 14,
        fontWeight: '400',
        textAlign: 'left',
        verticalAlign: 'middle',
      },
      dataSource: { type: 'static', value: 'CPU 使用率' },
    },
    {
      id: 'stage-card-rule',
      type: 'base.rule',
      name: '卡片分隔线',
      parentId: null,
      position: { x: 84, y: 180 },
      size: { width: 220, height: 2 },
      rotation: 0,
      zIndex: 5,
      status: { locked: false, hidden: false },
      props: { axis: 'horizontal' },
      style: { color: '#1f2a44', thickness: 2, dash: 'solid', opacity: 1 },
      dataSource: null,
    },
    {
      id: 'stage-card-value',
      type: 'host-app.metric-value',
      name: 'CPU 读数',
      parentId: null,
      position: { x: 84, y: 186 },
      size: { width: 220, height: 70 },
      rotation: 0,
      zIndex: 6,
      status: { locked: false, hidden: false },
      props: { unit: '%' },
      style: {},
      dataSource: {
        type: 'host-resource',
        resourceType: 'demo_metric',
        resourceId: 'cpu_usage',
        params: { points: { kind: 'literal', value: 24 } },
        binding: { fields: { value: ['value'] } },
      },
    },
  ],
  variables: [],
  blueprint: { rules: [] },
} as const;

/** 空库播种的初始大屏名称。 */
export const SEED_SCREEN_NAMES: readonly string[] = ['默认销售大屏', '系统监控大屏'];

/**
 * 起始文档的序列化文本。启动期即执行结构校验：起始文档写错时立刻失败，
 * 而不是等到前端加载时才暴露。
 */
export function serializeStarterDocument(): string {
  const validation = validateScreenDocumentInput(STARTER_DOCUMENT);
  if (!validation.ok) {
    throw new Error(`HOST_API_STARTER_DOCUMENT_INVALID: ${validation.reason}`);
  }
  return validation.serialized;
}
