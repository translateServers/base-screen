# 事件、宿主动作与插件运行期贡献

> 返回[宿主使用指南](../usage.md)。

## 插件贡献运行期行为（数据处理器与蓝图宿主动作）

前面几节都是**作者面**贡献：插件加物料、面板、检查器控件，或声明资源类型。若要让插件参与
**文档的运行时语义**——即 DataV 里"数据过滤器"与"宿主动作"那一类能力——用这两类贡献
（ADR-0084）：

```ts
definePlugin({
  manifest: {
    id: 'acme.pipeline',
    dependencies: [],
    capabilities: ['data.process', 'blueprint.action.execute'],
    contributions: [
      // 文档的 dataSource/变量 processorId 引用它
      { kind: 'dataProcessor', id: 'topBy', name: '取前 N 条',
        configSchema: { kind: 'object', properties: {
          field: { kind: 'string' }, count: { kind: 'number' } }, required: ['field', 'count'] } },
      // 文档的 blueprint host-action.actionId 引用它
      { kind: 'blueprintAction', id: 'acme.pipeline.spotlight', name: '高亮组件',
        payloadSchema: { kind: 'object', properties: {}, required: [] },
        requiredCapability: 'blueprint.action.execute' },
    ],
  },
  dataProcessors: {
    topBy: (value, config) => ({ ok: true, value: rank(value, config), diagnostics: [] }),
  },
  blueprintActions: {
    'acme.pipeline.spotlight': (payload) => ({ ok: true, value: null, diagnostics: [] }),
  },
  // activate / deactivate / dispose 必填，同其它插件
});
```

**两个方向都必须是宿主→插件**：宿主（或 Engine）发起请求，manager 把请求路由到上面这两个
handler 记录里。因此这两项能力**没有端口工厂**——它们不要求宿主为插件提供任何东西，只标记
"该插件声明的处理器/动作可被执行"。这与 `command.execute`（插件→宿主，需要 `createCommandPort`）
方向相反，别对齐错。

宿主侧两处接线：

```ts
// 数据处理器：宿主在自己的变量/数据源解析里按 processorId 组合。
const processed = await manager.applyDataProcessor({
  processorId: 'topBy',
  value: upstream,            // 上游 JSON 值
  config: { field: 'value', count: 10 },
});

// 蓝图宿主动作：接到 designerHostAdapter.actions（Host Action Port），
// 由 Engine 作为宿主动作抛出后转发到 manager。
designer.designerHostAdapter = {
  capabilities: { /* ...其余为 false */, actions: true },
  actions: { async execute(action) { await manager.executeBlueprintAction(action); } },
};
```

> **`designerHostAdapter` 是聚合端口。** 赋值时它会用自身的 `resources` / `variables` /
> `datasets` / `variableCatalog` 字段**重写**对应的单项端口，未提供的会被清空。若宿主既要单项
> 端口又要宿主动作，必须在适配器里把这些端口对象原样透传，否则刚才设置的端口会被静默清掉。

**行为收紧（ADR-0084 的目的之一）**，接入时注意：

- `host-action.actionId` 此前是个**无授权的通吃端口**——任何 id 都直接交给宿主解释。现在
  **必须引用已声明动作**：manager 对未声明 id 返回 `PLUGIN_CORE_CONTRIBUTION_UNKNOWN` 失败关闭。
- `processorId` 此前只是透传给宿主的字符串，**没有任何注册表**。现在未声明的 `processorId`
  同样失败关闭。依赖这两处宽松行为的存量接入需要改为声明式。
- 作者面同步反映同一事实：蓝图动作节点与检查器对未声明动作显示"未声明的宿主动作"，而不是
  让作者配完后在运行期静默失败。

**边界不变**：插件仍是同 realm 受信代码（ADR-0084），这两类贡献不引入用户可编写脚本、
不引入沙箱、也不给 Base Screen 增加后端/加工职责——实际连接、聚合、脱敏仍归宿主（ADR-0027）。
用户可在界面里编写过滤代码的那种能力属于另一个决策（需执行隔离），本阶段不做。

完整可运行示例见 [`plugins/plugin-pipeline`](../../plugins/plugin-pipeline)——它是首个**只贡献运行期
行为、零界面元素**的插件；浏览器侧见 `/?designer&case=plugin-runtime`。

## 物料事件、宿主事件和宿主动作

Viewer 把物料交互冒泡为 `base-screen-material-event`：

```ts
viewer.addEventListener('base-screen-material-event', (event) => {
  const detail = (
    event as CustomEvent<{
      componentId: string;
      name: string;
      payload: unknown;
    }>
  ).detail;

  hostTelemetry.track('screen_material_event', detail);
});
```

Designer 默认关闭画布内组件原生事件。打开底部状态栏「事件」开关
（`data-status-toggle="native-events"`）后，设计态画布切到交互模式：组件原生事件
（如文本 `valueClick`、图表 `seriesClick`、表格行点击）以同样的 `base-screen-material-event`
CustomEvent 从 designer 元素转发给宿主，`detail` 与 Viewer 完全同形
（`{ componentId, type, name, payload }`）；原生 CSS/悬停交互也随开关一起生效：物料自身声明的
pointer 光标与悬停反馈、React/Vue 桥接渲染的原生控件（button 等）的 hover/active/focus 样式，
开关关闭时全部静默（桥接控件以 pointer-events 门控，不影响设计器选择/拖拽）：

```ts
designer.addEventListener('base-screen-material-event', (event) => {
  const detail = (event as CustomEvent<{ componentId: string; name: string }>).detail;
  hostDebugPanel.log(detail.componentId, detail.name);
});
```

关闭开关后行为与现状一致（点击与悬停均静默、事件零外泄）；开关只影响当前实例的交互模式，
不进文档、不持久化。切换在渲染器内原地生效，组件 DOM 与数据集请求不会重建。

Blueprint 的 `emit-host-event` 通过 `blueprintRuntimePort` 交给宿主事件总线：

```ts
const configured = viewer.configure({
  catalog,
  runtimeContributions,
  blueprintRuntimePort: {
    emit(event) {
      hostEventBus.publish(event.name, event.payload);
    },
  },
  blueprintHostActionPort: {
    async execute(action) {
      await authorizedHostActions.execute(action.name, action.payload);
    },
  },
});
```

未提供 `blueprintRuntimePort` 时，宿主事件会以 `base-screen-blueprint-event` Custom Event 发出。
`host-action` 没有端口时会失败并产生诊断，不会静默执行任意函数。宿主动作端口需要自行处理
授权、幂等、审计和业务错误脱敏。

### 条件样式：文档规则与宿主端口

数据驱动的预警样式有两条互补通道（合并顺序固定：基础 `style` → 命中的文档 `styleRules` →
端口覆盖，同键后写覆盖先写；effective style 只存在于运行时，不回写文档、不产生历史）。

**通道一：文档 `styleRules`**（ADR-0080）适合随屏幕版本化的轻量视觉映射。宿主把判定结果
投影进数据（如 `{ value: 85, level: 'warn' }`），文档只保留纯视觉规则：

```json
{
  "styleRules": [
    { "id": "warn", "when": { "path": ["level"], "operator": "eq", "value": "warn" },
      "style": { "color": "#ff4d4f", "fontWeight": "700" } }
  ]
}
```

Designer 不提供 `styleRules` 内建编辑区。既有文档规则继续正常解析和渲染；确需维护文档规则时，
由宿主生成 canonical 文档，或通过公开 `update-components` 事务整体替换 `styleRules`。

**通道二：`conditionalStylePort`**（ADR-0080）适合判定与视觉映射都归宿主告警体系维护的场景：
阈值调整零文档变更、多租户同屏不同视觉策略。`resolve` 必须是同步纯函数（相同输入返回相同
结果；异步数据走 `resourcePort`/`refreshData` 产生新 `dataState` 后自然重求值）：

```ts
const configured = viewer.configure({
  catalog,
  conditionalStylePort: {
    resolve({ componentId, dataState }) {
      if (componentId !== 'kpi-1' || dataState.status !== 'ready') return undefined;
      const level = alarmRegistry.levelFor(componentId, dataState.value);
      return level === 'warn' ? { color: '#ff4d4f', fontWeight: '700' } : undefined;
    },
  },
});
```

端口对每个组件的每次求值都会收到完整 `dataState`（含 `idle`/`loading`/`error`），可自行决定
降灰等状态样式。端口返回的覆盖必须满足物料 `styleSchema`：非法覆盖与 `resolve` 抛异常都会被
fail-closed 隔离——忽略本次覆盖、保留基础+规则样式并上报一条诊断，渲染不中断。Designer 支持
同一配置（`configure` 或初始化前的守卫 setter），设计态画布与 Viewer 走同一渲染路径预览告警
效果；未配置端口的实例行为与现状完全一致。
