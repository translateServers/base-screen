# Designer Blueprint Workbench Design

## 1. 组件边界

```text
BaseScreenDesignerElement
  ├─ global topbar (48px) + left/right panels + status
  ├─ Canvas surface (kept mounted)
  ├─ Blueprint semantic controller
  │    ├─ graph projection / commands / compile / trace
  │    └─ DesignerSession history + project dirty state
  └─ named slot ── state event ──> XJ Vue Flow canvas
                   <─ command event ─
```

slot consumer 不能接收 catalog、controller、callback、Vue component 或服务对象。Base Screen 不能读取宿主
Vue 状态；双方只交换冻结 JSON 快照和严格命令。

## 2. 模式状态机

- 初始值为 `initialWorkbenchMode ?? 'canvas'`。
- `user` 来源于页签，`api` 来源于 `setWorkbenchMode`，slot 丢失使用 `fallback`。
- Blueprint 不可用时 API 请求失败关闭并保留 Canvas；活动时丢失 slot 则一次性切回 Canvas、发诊断和事件。
- 两个中央面始终存在。模式变化只更新 active、可见 chrome 和焦点，不销毁宿主元素。

## 3. 协议

状态由 Base Screen 单向生成，字段包括 `generation`、`documentRevision`、`projectRevision`、`active`、历史能力、
graph、selection、diagnostics、trace、可选 view request 与 last command。每次 slot 身份变化 generation 递增。

宿主命令必须带 `commandId + generation + documentRevision`。处理顺序固定为：严格 parse → generation →
revision → command-id 去重 → 语义校验 → 单命令/事务执行 → 权威状态重发。去重缓存有界，重复命令返回既有结果。

## 4. 历史和布局

- connect/delete/属性更新/insert 由一个 Core `replace-blueprint` 命令提交。
- 所有节点库条目都可先插入。组件继续使用 `component:*` 布局标识；尚未归属规则的逻辑节点使用严格、可解析的
  `unconnected:*` 标识。连接组件事件后，Base Screen 在同一事务中创建/扩展规则并把布局标识替换为
  `condition:*` 或 `action:*`，位置不变。
- 未连接条件只能作为连接目标；它获得组件事件输入后才可从 `condition:true` 继续连接动作，避免生成无触发器规则。
- node drag stop 用一个 `commit-layout` 提交全部可见节点位置及当前 viewport。
- zoom/pan move end 用一个 `commit-viewport`；程序化恢复视口不提交。
- auto-layout 在宿主本地一次计算，完成 fit 后以一个 `commit-layout` 同时提交节点和 viewport。
- simulation 只更新 trace 会话状态，不修改文档或历史。

## 5. 发布与回滚

交付顺序为：构建 Base Screen contracts/engine/sdk → 生成同名 vendor tarball → XJ 更新 lock 与消费者 → 两仓验证。
上线必须在同一窗口切换静态前端与包产物。回滚同时恢复 Base Screen 包和 XJ 消费者；文档 schema 未变化，
因此不需要数据回滚。

## 6. 左侧宿主分组

- `leftPanelGroups[].workbenchModes` 是严格、冻结的导航投影；省略时为 Canvas-only。
- Canvas 与 Blueprint 各维护一个当前 Tab。`selectLeftPanelGroup(id)` 只在当前模式解析并选择分组。
- 每个 group id 只生成一份直接位于左栏的 `tabpanel + slot`。Blueprint 节点库只生成指向该 panel 的 Tab，
  不生成第二个同名 slot；模式切换只同步 `hidden`、标题、计数和 `aria-labelledby`。
- 宿主分组更新时先重建有界导航/tabpanel，再分别校正两种模式选择；当前模式的权威 group id 经同一事件去重派发。
- slot 内容继续绕过 Engine 私有事件路由，宿主框架状态、权限、请求和生命周期不进入 Designer session。
