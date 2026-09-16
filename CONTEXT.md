# Base Screen 领域词汇

本文件是 Base Screen 的领域词汇表：记录跨包协作时**必须统一理解**的概念，以及它们的唯一实现落点。
权威行为依据仍是 [当前能力基线](./docs/baseline/README.md)，长期边界以[已接受的 ADR](./docs/decisions/README.md) 为准。

术语按主题分组，不按引入时间排序。新增术语时，一并写明它的唯一落点与「不得重复实现」的约束。

## 契约与诊断

- **诊断规范序（Canonical Diagnostic Order）**  
  由 `@base-screen/contracts` 独占定义的全序：先比较路径（逐段比较，**数字段先于字符串段**），同路径再比 `code`，
  最后比 `message`。唯一实现是 `compareScreenDiagnostics` / `sortScreenDiagnostics`。任何包不得自定义排序；
  发现分歧一律以规范序为准。

- **诊断上限哨兵（Diagnostic Limit Sentinel）**  
  诊断达到 100 条时以 `DIAGNOSTIC_LIMIT_REACHED` 替换末位。Contracts 的收集器是**相位感知**的（哨兵路径取自阶段，
  文档阶段为 `['document']`），Plugin 侧的收集器哨兵路径为 `[]` —— 两者语义不同，**各自保留**，不合并。
  该 code 与文案属公共可观察行为，不得因重构改变。

- **文档合成（Document Synthesis）**  
  为校验一个局部输入（如单个 `dataSource`）而拼装整份 `ScreenDocument` 再交给文档解析器的反模式。
  局部输入应由 `contracts` 提供独立解析入口，不得让文档形状泄漏进调用方。

- **身份词法谓词（Identity Predicate）**  
  组件 id 与变量名的词法判定只有两个谓词：`isScreenComponentId`、`isScreenVariableName`（`contracts`）。
  不要在新位置重新声明正则字面量，也不要用 `new RegExp(PATTERN)` 重新包裹导出的模式字符串。

## 插件贡献词汇

- **贡献类型描述符（Contribution Kind Descriptor）**  
  ADR-0084 贡献词汇在 `@base-screen/plugin-core` 内的唯一实现落点。逐 kind 声明：字段白名单、身份串形态、
  id 词法、专属校验、运行时 handler 字段。**描述符表本身是包内实现细节**，对外只暴露窄行为接口：
  `BaseScreenPluginContributionKind`、`BaseScreenPluginContributionHandlerField`、
  `contributionHandlerField`、`declaredContributionIds`、`listContributionHandlerKinds`、
  `contributionIdentity`、`readContributionHandlerRecord`。  
  新增一种贡献类型时，改动应局限在描述符表与 plugin-manager 的穷尽表；不得再新增 per-kind 的 switch。

- **贡献类型计划表（Contribution Kind Plan）**  
  `@base-screen/plugin-manager` 对「该 kind 往哪去」的穷尽式解释表：是否进入运行时贡献索引、进入哪个桶、
  进索引前是否必须先过授权门。键是 plugin-core 导出的 kind 联合类型，因此**漏一个 kind 是编译错误**，
  而不是运行期静默漏投影。

- **授权交集（声明 ∩ 批准 ∩ 支持）**  
  一项贡献只有同时出现在插件声明（清单 `contributions`）、宿主批准（`grantedCapabilities`）与宿主支持
  （能力表）三者交集中，才进入运行时索引；不在交集中的贡献对作者面与执行面都不可见。
  这是既有 command 规则的推广，**不是新增信任通道**。

- **贡献身份（Contribution Identity）**  
  贡献的全局唯一字符串：物料为 `material:<type>`，其余为 `<kind>:<id>`。清单内查重与跨插件冲突判定
  共用同一身份定义（`contributionIdentity`），不得各自推导。

- **handler 对应关系（Declared ↔ Handler Correspondence）**  
  「声明的贡献」与「运行时 handler 记录」必须一一对应：缺 handler、多 handler 都失败关闭。
  该规则只有一份实现（`readContributionHandlerRecord`）；调用方只决定报告粒度（manager 预检收集全部，
  作者面取首条），诊断的 code、路径与文案由调用方给出前缀后保持一致。

## Designer 组合根

- **控制器生命周期登记（Controller Lifecycle Registry）**  
  `<base-screen-designer>` 各控制器的连接顺序与释放责任的唯一声明处。登记表之外不得有手写 teardown；
  遗漏释放必须是类型错误而非静默。相关约束见 `scripts/check-engine-import.mjs` 对 `designer-element/` 结构的登记。

## 物料

- **物料状态容器（Material Loading Container）**  
  官方物料共享的加载/空态容器（`@base-screen/material` 的 `createBaseScreenMaterialLoadingContainer`）。
  物料只提供「读数本身的构成」（单位、前后缀、表头列名），不提供描述性文案；状态展示与无障碍由容器统一负责。
