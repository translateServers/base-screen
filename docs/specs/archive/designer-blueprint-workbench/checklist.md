# Designer Blueprint Workbench Checklist

## 契约与状态

- [x] 模式 API、初始配置和 mode-change reason 已公开并由 SDK 转发。
- [x] 状态/命令均为严格 JSON-safe 协议；未知、过期、重复和越界输入失败关闭。
- [x] Blueprint detached request/commit 已移除，组件文本 authoring 保留。
- [x] ScreenDocument schema 和 `blueprint.layout` 形状未改变。

## 编辑与 UI

- [x] 只有一套常驻全局工具栏、左右面板和底部状态。
- [x] Blueprint 操作直接产生全局脏状态并进入统一历史。
- [x] Canvas/Blueprint 中央面保持挂载，slot 缺失/移除有确定失败策略。
- [x] 宿主 `ready` 握手可在文档载入前完成，不产生“设计器已卸载”伪诊断。
- [x] Blueprint 左栏提供组件/逻辑/变量分区，右栏提供配置/问题/运行分区，并保留键盘页签导航。
- [x] 图层节点库投影全部 ScreenDocument 组件；中央图只投影 `blueprint.layout.nodes` 成员，显式空 layout 保持空画布，旧文档缺少 layout 时仍可从规则推断节点。
- [x] 未放置组件提供“加号添加”和拖拽落点添加两条路径；拖拽不是唯一入口，已放置组件改为定位当前节点。
- [x] 条件、通用动作和变量动作无需既有规则或当前选择即可通过点击/拖拽添加；待连接状态、默认配置和删除入口可见。
- [x] 未连接节点立即进入文档脏状态与统一历史；连接后在一个事务中保留位置并转换为正式条件/动作节点。
- [x] 右侧按选择上下文展示节点信息、输入动作、输出事件、上下游说明、条件/动作配置、校验与运行轨迹。
- [x] 1024-1279px 收起次要文字且工具栏高度稳定；焦点、ARIA 和 32px 点击区域已实现。
- [x] Blueprint `rail-tabs` 支持 `workbenchModes` 宿主分组、方向键与程序化选择；Canvas/Blueprint 独立保留 Tab。
- [x] 双模式分组只使用一份命名 slot/tabpanel，模式切换不重挂载宿主内容；动态移除有确定回退与事件。

## 宿主与交付

- [x] XJ 只保留 Vue Flow、Dagre、局部图形手势、MiniMap、缩放和模拟入口。
- [x] XJ 不再维护 draft/history/apply/cancel 或第二套全局壳层/底栏。
- [x] Base Screen vendor contracts/engine/sdk 已同步到 XJ，且无数据库/文档迁移。
- [x] Base Screen `pnpm verify:m0` 通过。
- [x] XJ 全量 unit/build 通过。
- [x] Playwright 1920×1080、1024×640 与键盘/焦点验收通过。
