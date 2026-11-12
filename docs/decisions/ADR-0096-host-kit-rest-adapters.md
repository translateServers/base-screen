# ADR-0096：宿主接入辅助包 `@base-screen/host-kit`

> 状态：已接受
> 日期：2026-11-11
> 关联：ADR-0027（轻量设计器基座与宿主处理）、ADR-0074（外围插件区与依赖分区）。

## 背景

宿主接入 Designer/Viewer 时，项目适配器与数据集端口是必写的宿主侧代码。三个示例宿主逐字复制
同一套实现，xjdatahub 又重写了一遍。这套样板里有几条容易踩空、踩空就运行时失败的契约硬规矩：

- `ScreenDatasetEntries` 是 strictObject，`list` 必须剥掉后端返回的 `groups`；
- `query` 的 abort signal 在第二个参数上，取消须返回空诊断（取消不是失败）；
- `params` 已由基座按定义校验求值，端口只拼 query string，不下发 `componentId`；
- 后端错误码到物料冻结诊断码的映射（404/400/422/5xx/形状错误）；
- 项目读取先迁移旧形态文档，保存把 `REVISION_CONFLICT` 映射成 `PROJECT_CONFLICT`。

这些规矩目前只以散文形式写在 `examples/README.md`，靠宿主手抄传递。第二个宿主团队会立刻复制出
第二份实现，并各自踩一遍同样的坑。这是缺少发布面导致的结构性重复，与 ADR-0095 的令牌漂移同类。

## 决策

### 1. 新增 `packages/host-kit`，收编通用端口样板

新增固定包 `@base-screen/host-kit`（`packages/` 区，仅依赖 `@base-screen/contracts`，零第三方依赖，
使用可注入的全局 `fetch`）。提供：

- `createHttpProjectAdapter({ baseUrl, fetch?, migrate?, mapping? })`：项目会话适配器；
- `createRestDatasetPort({ baseUrl, fetch?, mapping? })`：数据集端口，内置上述四条硬规矩与错误码映射、
  `queryScope: 'dataset'`；
- `createHostKitHttp` / `toHostKitSearch` / `toAbortSignal`：最小 JSON HTTP 客户端与桥接工具。

### 2. 只覆盖通用契约形状，业务 extras 仍归宿主

helper 对接 `examples/README.md` 的示例后端 REST 契约。告警快照、故障注入、轮询节拍、素材库等业务
extras 不进 host-kit——宿主需要时在端口外再包一层。host-kit 不引入存储、网络重试、任务队列或业务
降级，遵守 ADR-0027 的宿主/基座职责划分。

### 3. 可选辅助，不改变既有公共契约

host-kit 是可选 helper，不是接入前提。`defineBaseScreen*()`、`configure()`、端口契约与元素 API 均
不变；宿主可直接实现端口而不使用 host-kit。包清单由 `tooling/checks/packages.mjs` 固定，
依赖白名单在 `tooling/checks/boundaries.mjs` 登记 `host-kit: ['contracts']`。

## 后果

- 宿主接入的端口样板有了单一上游落点，硬规矩由公共代码与单测保证，不再靠散文手抄。
- host-kit 成为新的公共契约面：其 helper 签名与错误映射受 API 报告与 changeset 治理。
- 示例宿主可逐步迁移到 host-kit（迁移与否不强制），迁移后共享文件仍逐字一致。
- 后端协议不同的宿主可按操作提供 `mapping`，用 request 映射 URL/method/body、用 response 把 unknown JSON 投影为 canonical envelope；投影后仍由 contracts 严格解析。默认 REST 行为保持兼容，自定义映射可保留 opaque revision。鉴权通过 fetch 注入或宿主端口实现，不增加新的网络策略。