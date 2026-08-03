
# 仓库说明

## 当前状态

- Base Screen 处于实现前阶段：尚无 manifest、lockfile、源码目录、CI，也没有可执行的构建、lint、类型检查或测试命令。不要臆造命令或谎报代码验证结果。
- `docs/architecture/base-screen-evolution.md` 定义的是目标架构，而非已实现的行为。包管理器、Node 版本、工具链、npm scope 以及浏览器支持范围仍属于待 ADR 决策的事项。

## 决策来源

- 将 `docs/architecture/base-screen-evolution.md` 中未加标记的规则视为已确认。其中的示例 API 属于语义草图；只有被接受的 Spec 和已发布的声明才能冻结签名。
- 对该文档进行实质性修改时，须更新文档顶部的日期及其变更日志。涉及公共契约、依赖方向、安全边界或兼容性变更的内容须先提交 ADR；实现类工作须先具备面向验收的 Spec。
- 一旦存在可执行的配置，命令和实际行为以该配置为准。不允许实现悄悄推翻架构决策：要么修订文档使其一致，要么补充一份 ADR。

## 架构边界

- Base Screen 是一个独立、可嵌入的库。绝不引入 Nebula 应用代码、Router、Store、后端 DTO、认证、数据集或 UI 组件。
- 源自 Nebula 的源码在进入 MIT 交付物之前，必须具备文件级的来源说明、负责人授权以及署名决策。单纯的架构思想不需要形成运行时依赖。
- Web Components 是稳定的宿主和物料 ABI。React 19 与 Vue 3 是可选的物料创作桥接层，而非渲染器协议或重型宿主封装。
- `contracts` 是持久化线协议（wire schema）、公共数据类型、版本、迁移以及跨边界诊断的唯一所有者。不得在其他位置复制规范解析器或持久化 schema。
- 宿主通过适配器负责加载、保存、发布、资源执行、认证与权限。核心与 DSL 编译保持纯粹；Base Screen 不得读取宿主的 token、cookie、路由、query client 或 store。
- 项目文档可以包含稳定的资源意图，但绝不能包含可执行的模块位置、URL、header、token、cookie、SQL、脚本或连接配置。宿主导入的物料和插件属于受信任代码；文档永不决定要加载哪些代码。
- 跨边界的文档、模型、事件和适配器的值必须保持为有限、无环的 JSON，不得包含函数、DOM 节点、promise、类实例、危险的原型键或非有限数值。

## 规划中的包归属

- 已确认的目标包含十二个包：`contracts`、`core`、`renderer`、`engine`、`material`、`plugin-core`、`plugin-manager`、`plugin-sdk`、`react`、`vue`、`sdk` 和 `testing`。未经 ADR 不得合并它们的职责归属。
- 依赖方向是严格的：`contracts` 没有任何工作区依赖；`core` 不依赖插件、渲染、引擎、物料、框架桥接或 SDK；`plugin-core` 不依赖 manager 或 SDK；`renderer` 消费的是目录接口（catalog interface），而非具体的 `plugin-manager`。
- `engine` 拥有实时设计会话、store、交互状态机、命令派发和历史记录；`core` 拥有它们的纯类型与算法；`renderer` 拥有运行时 DOM 和查看器行为。
- `sdk` 是产品组装层，也是 `<base-screen-designer>` 与 `<base-screen-viewer>` 的唯一注册者。工作区内的包不得反向通过 `sdk` 引入下层 API。
- `material`、`react` 和 `vue` 不得依赖 engine、renderer 或 SDK。React 和 Vue 保持为 peer dependency，且不得被打包进已发布的桥接层中。
- 生产包绝不依赖 `testing`；该包仅可依赖公共包，用于提供 fixture、假实现（fake）、一致性测试套件和浏览器测试框架（harness）。

## 文件大小护栏

- 将行数视为评审阈值，而不是拆分内聚行为或创建纯转发文件的理由。统计整个手写文件的行数；生成的文件豁免。
- 纯领域逻辑、管理器、适配器和运行时模块的目标上限为 300 行；超过 500 行时，在添加更多行为之前应先按职责拆分。
- Web Components、框架桥接和 UI 控制器的目标上限为 250 行；超过 400 行时，在渲染、状态协调和生命周期代码可独立测试的情况下，应将这些关注点分离。
- 契约 schema、声明、manifest 和迁移的目标上限为 400 行；超过 600 行时，按契约或版本拆分，且不得复制规范 schema 或解析器。
- 测试、fixture 和测试框架的目标上限为 500 行；超过 800 行时，按行为或场景拆分，除非数据驱动的表格形式在单文件中更清晰。
- 生成的产物和纯数据产物没有行数限制，但必须标明其生成器或权威来源，且不得包含隐藏的手写行为。

## 契约陷阱

- 文档状态、视口状态、交互状态和运行时覆盖（runtime-override）状态必须保持分离。只有文档状态会被持久化并由撤销/重做恢复。
- SDK 和物料的默认入口必须无注册副作用。注册属于显式的 `define()` 调用或有文档说明的 `/auto-register` 入口；相同 tag 加相同构造器是幂等的，而任何标识冲突都必须失败关闭（fail closed）。
- 尽管 `CustomElementRegistry` 是全局的，物料可用性却是实例作用域的。缺失、被禁用、冲突或能力不兼容的物料和插件必须失败关闭，而不是渲染占位符。
- 规范解析拒绝未知字段以及未知或未来的 `schemaVersion` 值。旧版本使用确定性的单步迁移链；Nebula 转换是一个独立的导入器，且不得修改（mutate）输入。
- React/Vue 桥接的断开清理延迟一个微任务执行：同步重连可保留根节点和本地状态；检查时仍处于断开状态的元素将被完全销毁，之后从其最后一个有效的脱离模型（detached model）重建。
- 包 SemVer、文档 `schemaVersion`、物料 API 版本和物料实现版本必须相互独立；绝不能由其中一个推断另一个。

---

说明：

- 技术标识符（包名、文件名、HTML 标签、`define()`、`schemaVersion` 等）保留英文原样，避免歧义。
- "fail closed" 译为"失败关闭"，并首次出现时保留英文，方便团队对照。
- 如需要，我也可以提供一份中英对照版本，或将部分术语（如 ADR、Spec、harness）统一替换为纯中文译法。
