# 接入宿主数据

> 返回[宿主使用指南](../usage.md)。


宿主数据由四部分组成：

- `datasetPort`：Designer 发现数据集并读取字段、参数编辑元数据，并执行数据集查询。
- `resourcePort`：Viewer/Designer 按稳定 `resourceType + resourceId` 查询数据。
- `variableCatalogPort`：Designer 搜索严格的宿主变量目录并按需读取预览声明。
- `variablePort`：把文档中的宿主变量 ID 解析为当前运行值。

## 数据集目录

```ts
import type { ScreenHostDatasetPort } from '@base-screen/contracts';
import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
} from '@base-screen/contracts';

const datasetPort: ScreenHostDatasetPort = {
  async list({ query, cursor, limit, groupId, signal }) {
    return parseScreenDatasetEntries(
      await hostDatasetService.list({ query, cursor, limit, groupId, signal }),
    );
  },

  async describe({ datasetId, signal }) {
    return parseScreenDatasetDefinition(await hostDatasetService.describe({ datasetId, signal }));
  },

  async query({ componentId, datasetId, params }, { signal, context }) {
    return parseScreenTabularDataset(
      await hostDatasetService.query({ componentId, datasetId, params, signal, context }),
    );
  },
};
```

`list()` 返回 `ScreenDatasetEntries`（`items` 与可选 `nextCursor`），`describe()` 返回
`ScreenDatasetDefinition`；可选实现 `groups()` 以提供分组导航。描述只暴露安全的名称、字段和
参数编辑元数据，不携带连接信息。参数的权威结构和约束来自对应 resource type 的
`configSchema`。

## 资源解析

```ts
import type { ScreenHostResourcePort } from '@base-screen/contracts';

const resourcePort: ScreenHostResourcePort = {
  async resolve(
    { componentId, resourceType, resourceId, params },
    { signal, context },
  ) {
    return hostDatasetService.resolve({
      componentId,
      resourceType,
      resourceId,
      params,
      signal,
      context,
    });
  },
};
```

`params` 已经把 literal 和 variable 参数求值成普通 JSON。字段绑定不会发送给查询端口，而是由
Base Screen 在安全结果投影阶段处理。表格数据应符合 `ScreenTabularDataset`；对后端返回值可
使用 `parseScreenTabularDataset()` 再进入端口结果。

宿主实现必须：

- 只接受已授权的 `resourceType`、`resourceId` 和参数。
- 响应 `signal.aborted`，把信号继续传给底层请求或主动停止工作。
- 返回 `ScreenParseResult`，不抛出包含 token、SQL、内部 URL 或原始服务端消息的错误。
- 对返回值执行容量限制和字段裁剪；Base Screen 不是无限数据传输通道。
- 将 `context` 仅用于本次追踪、审计或模式判断，不把它写回 Screen Document。

## 宿主变量

```ts
import type {
  ScreenHostVariableCatalogPort,
  ScreenHostVariablePort,
} from '@base-screen/contracts';

const variableCatalogPort: ScreenHostVariableCatalogPort = {
  async list({ query, sourceType, cursor, limit, signal }) {
    return hostVariableService.list({ query, sourceType, cursor, limit, signal });
  },

  async describe({ sourceId, signal }) {
    return hostVariableService.describe({ sourceId, signal });
  },
};

const variablePort: ScreenHostVariablePort = {
  async resolve(request) {
    return hostVariableService.resolve(request);
  },
};

designer.configure({
  catalog,
  variableCatalogPort,
  variablePort,
});
```

`list()` 按 `data-source | url-query` 来源分页，每页最多 50 项，只返回
`sourceId`/`sourceType`/`name`/`description`；`describe()` 额外返回 `previewable`。响应严格拒绝
未知字段、重复 ID、非法名称/游标和超限内容。
直接配置 `variableCatalogPort` 时必须同时配置 `variablePort`；Adapter 形式则必须同时开启
`variableCatalog` 与 `variables` capability。

变量端口收到文档变量的稳定 `variableId`、`sourceId`、`sourceType`、`initialValue`、`controlled`、
可选 `processorId`/`autoUpdate`，以及必填权限边界 `purpose`。`runtime` 用于 Viewer/Designer 运行
求值，`authoring-preview` 用于配置表单的数据响应预览。宿主应对敏感变量拒绝后者；预览只在当前
会话显示有界摘要，不写入 Screen Document 或历史。

作者从 Blueprint 左侧「全局变量管理」进入闭环：来源固定为静态值、数据源请求和 URL 查询条件；
完整配置包含名称、描述、初始值、过滤器、数据响应、受控模式和自动更新。变量行悬停提供编辑、加入
Blueprint、重命名、复制和删除，右侧使用次数可展开精确位置。静态值可直接输入普通文本；数字、
布尔、`null`、对象和数组按 JSON 解析。重命名只改变展示名，稳定 ID 与全部引用保持不变。

文档保存类似以下严格配置；实际 URL、API/SQL、凭证和过滤代码留在宿主：

```ts
const regionVariable = {
  id: 'region',
  type: 'data-source',
  name: 'region',
  description: '当前区域',
  sourceId: 'current-region',
  initialValue: '华东',
  processorId: 'normalize-region',
  controlled: false,
  autoUpdate: { intervalSeconds: 30 },
};
```

受控动态变量在运行快照中忽略 `initialValue`，当前值由宿主解析或交互写入。缺少变量端口、解析失败
或结果不是 JSON-safe 值时，资源不会带着猜测值继续查询。

组件可把变量绑定到 `host-resource` 参数，或直接使用
`{ type: 'variable', variableId: 'region' }` 作为数据源。Blueprint 变量节点提供数据更新/请求状态事件、
导入变量和请求组件数据动作；文档引用推导的依赖边不可删除，作者创建的普通规则边可删除。引用清单
只投影当前 canonical document，不持久化索引，也不向宿主发送组件、规则或表达式详情。

运行时以文档变量 ID 读写、监听和刷新：

```ts
const region = viewer.getVariable('region');
const stop = region?.onChange((value) => console.log(value));
region?.set('华北');

viewer.refreshVariables({ variableIds: ['region'], traceId: 'route-change-42' });
designer.refreshVariables(); // 刷新当前文档的全部动态变量

stop?.();
```

`variableIds` 填写文档变量 ID。动态解析和 `.set()` 都会通知监听器，触发 `data-updated` Blueprint
事件并差量刷新依赖组件。`autoUpdate.intervalSeconds` 会随请求提供给宿主，实际调度仍由宿主调用
`refreshVariables`，Base Screen 不内建轮询或订阅。

## 组合实现长尾能力

有几类常见需求直觉上以为 Base Screen 缺能力，实际都可用上面的公开面组合出来，不需要新端口或
新贡献类型。可运行模板见 `examples/browser-harness/datav-composition-fixture.ts`，对应断言由
`pnpm verify:browser` 执行。

**计时器触发。** Base Screen 不内建计时器（[ADR-0083](../decisions/ADR-0083-variable-system.md)）：
宿主自建调度，把值写进变量，由变量的 `data-updated` 触发 Blueprint 规则与宿主动作。

```ts
setInterval(() => {
  designer.getVariable('harness-tick')?.set(Date.now());
}, 1000);
```

规则侧用 `{ type: 'variable-event', variableId: 'harness-tick', eventName: 'data-updated' }`
作为触发器。这条路径缺的从来不是功能，而是"作者可在 Blueprint 上编辑延迟参数"的节点形态；
那属于 canonical 蓝图语义扩展，触发条件见[后续路线图](../roadmap/README.md)。

**用户可编写过滤器。** 文档里的 `processorId` 是不透明标识，脚本正文留在宿主资产服务：

```ts
const variablePort: ScreenHostVariablePort = {
  async resolve(request) {
    const resolved = await hostVariableService.resolve(request);
    if (request.processorId === undefined) return resolved;
    return pluginManager.applyDataProcessor({
      processorId: request.processorId,
      value: resolved.ok ? resolved.value : null,
      config: { scriptId: hostScriptIdFor(request.variableId) },
    });
  },
};
```

`config` 完全由宿主决定，所以可以只放一个 `scriptId`：换脚本不必改文档，也不必过插件预检。
过滤器由宿主自营插件以 `dataProcessor` 贡献声明，插件清单里只有 `configSchema`，没有脚本正文。
处理器是宿主受信同 realm 代码——宿主在其中执行的是自己管理的脚本，属于宿主自身的信任决策；
Base Screen 不提供用户脚本沙箱，也不为这类执行背书。未知脚本标识应由宿主失败关闭，
不要静默退回原值，否则作者会以为过滤器生效了。

**推送数据。** `resourcePort` 是请求-响应语义（deadline 与 generation guard），推送不走它：

```ts
subscription.on('metrics', (value) => {
  designer.getVariable('metric-value')?.set(value);
});
```

宿主在自己的订阅回调里写变量，后续链路与计时器完全一致。需要推送形态时不要在 `resourcePort`
上造轮询——那会同时破坏宿主与引擎对该端口一次性取数的假设；物料内部自行订阅则是另一条选项
（组件数据态由物料管理），此时不必经过变量。

## Resource type 和 capability

提供 `runtimeContributions` 后，Base Screen 会按 resource type 的 `configSchema` 校验参数，并
按授权 capability 编译 Blueprint。权威索引通常由宿主已有的插件激活结果提供：

```ts
viewer.configure({
  catalog,
  resourcePort,
  variablePort,
  runtimeContributions: pluginManagerSnapshot.contributions,
});
```

使用 `@base-screen/plugin-manager` 时应采用 `activate()` 成功返回的 snapshot；插件未激活、
resource type 未贡献或 capability 未授权时保持失败关闭。
