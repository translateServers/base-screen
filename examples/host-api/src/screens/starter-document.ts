import { validateScreenDocumentInput } from './screen-document-guard';

/**
 * 新建大屏使用的起始文档（canonical Screen Document 形状的普通 JSON）。
 *
 * - `stage-cpu` 演示 host-resource 数据绑定：`resourceType: 'demo_metric'`、
 *   `resourceId: 'cpu_usage'`，参数 `points` 为字面量。该组件使用三个前端各自实现的
 *   同一个宿主自有物料 `host-app.kpi-card`（原生自定义元素 / React 组件 / Vue SFC，
 *   manifest 完全一致），其 `dataCapabilities` 声明 `host-resource` 并带表格适配器；
 *   前端宿主数据通道（见 docs/usage/host-data.md 的 resourcePort）把 resourceId
 *   解析成一次 mock 指标查询。
 * - `binding.fields` 的键是物料 dataBinding 的角色 id（指标卡的角色为 `value`）。
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
      id: 'stage-cpu',
      type: 'host-app.kpi-card',
      name: 'CPU 指标卡',
      parentId: null,
      position: { x: 64, y: 140 },
      size: { width: 260, height: 120 },
      rotation: 0,
      zIndex: 3,
      status: { locked: false, hidden: false },
      props: { label: 'CPU 使用率', unit: '%' },
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
