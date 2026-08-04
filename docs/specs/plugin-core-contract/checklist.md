# Plugin Core Contract 验收清单

## 文档与前置决策

- [ ] ADR-0003 已接受，并冻结 `lib.dom` 声明、Element ABI、显式 type/tagName 绑定、有限 Manifest schema 与注册所有权。
- [ ] ADR-0004 已接受，并冻结同 realm 信任模型、四类贡献点、生命周期状态机、能力授权与命令端口签名。
- [ ] Spec 已按 ADR 回填全部 public strict object/discriminated union 完整签名、资源限制、Catalog 排序和 parser/resolver 责任，不存在待定策略。
- [ ] Spec 在设计阶段已加入 `docs/specs/README.md` 的“设计中”；生效条件完成后再移动到“生效中”，后续 ADR 若改变边界先同步 Spec。
- [ ] Contracts Foundation 的公开资源预算 API与 §18 全部 `PLUGIN_CORE_*` diagnostic code 已生效并通过真实 tarball 验收。

## Package 边界

- [ ] `@base-screen/plugin-core` 唯一 workspace dependency 是源码真实使用的 `@base-screen/contracts`。
- [ ] 包不依赖 Core、Renderer、Engine、Plugin Manager、Plugin SDK、Material、SDK、Testing、React 或 Vue。
- [ ] 默认入口在 Node ESM 中可导入且不访问 DOM global。
- [ ] 默认入口不注册 Custom Element、不执行插件、不修改 global、不产生 I/O。
- [ ] package 保持 ESM-only、`sideEffects: false`，发布 exports 与 tarball 内容正确。
- [ ] public declaration 不泄漏 Zod、框架类型、上层实现类型或宿主 DTO，并按 Spec 直接使用 `lib.dom` Element/Event 类型。

## Material 协议

- [ ] Material API version、Manifest、Model、dataState、Element、Constructor 与标准事件公共类型按 Spec 实现。
- [ ] tagName 由 Manifest 显式声明，合法性、`-v<major>` 绑定及双向冲突均按 Spec fail closed，不做推导、修复或 fallback。
- [ ] Material Manifest parser strict、detached、不可变、fail closed。
- [ ] Manifest 拒绝函数、类实例、框架组件、危险键、未知字段和超限输入。
- [ ] props schema 仅含七种有限 kind，属性面板只引用顶层 prop key，不形成第二份 validator/default 权威源。
- [ ] Element Model 使用完整 property 边界，不要求通过 attribute 传递复杂对象。
- [ ] dataState 判别联合拒绝 Error、Promise、Response、DOM node 和非 JSON 数据。
- [ ] 标准事件名固定，事件 detail 只包含声明事件名与 JSON payload。
- [ ] 未声明事件、非法 payload 或 `interactive=false` 均不能进入 DSL/runtime。
- [ ] Renderer 所需可信 componentId、type 与权限不从事件 detail 获取。

## Catalog 协议

- [ ] Material Catalog 支持 readonly get/has/list，且不暴露 mutation API。
- [ ] Material Catalog 不依赖或枚举全局 CustomElementRegistry。
- [ ] 缺失 type 返回 undefined，不 fallback 到其他 identity 或 major。
- [ ] Material Catalog 按 type UTF-16 升序 list，双实例可持有不同 snapshot 且互不污染。
- [ ] Plugin Catalog 仅包含已启用插件的安全 snapshot，并按 plugin id UTF-16 升序 list。
- [ ] Plugin Catalog 不暴露生命周期对象、activation context、command adapter 或可变 Registry。

## Plugin 协议

- [ ] Plugin API version、Manifest、dependency、capability 与 material/command/dataResourceType/blueprintCapability 判别联合按 Spec 实现。
- [ ] Plugin Manifest parser 只处理单份 Manifest 的 strict shape、自重复、range 和引用一致性；集合依赖/冲突由 Manager resolver 处理。
- [ ] Plugin Manifest 不包含 handler、生命周期函数、constructor、远程代码地址、宿主实例或凭证。
- [ ] runtime 与 Manifest 分离，Plugin Core 只定义固定状态机协议，不执行插件。
- [ ] activation context 仅含实例/plugin identity、已授予 capability 与限权端口，不含 Command Bus、Store、Router、DOM root 或 service locator。
- [ ] activate 回滚、deactivate 开始和 dispose 开始均立即使 session 端口失效并 fail closed；重复 dispose 幂等。
- [ ] 协议不宣称 iframe/Worker 或同 realm 恶意代码隔离能力。

## Plugin Command Port

- [ ] Command Port 使用 `execute({ commandId, args })` 异步签名，session/plugin identity 由宿主闭包绑定且不暴露 Core Command Bus。
- [ ] 未授权 command id 不会执行 Core command，并返回稳定诊断。
- [ ] command args/result 经过 JSON boundary、detached clone 与各 256 KiB 独立资源限制。
- [ ] 非 JSON、超限或失效 session 调用均 fail closed。
- [ ] 首期不能通过端口定义新的文档 mutation 类型。
- [ ] diagnostics 不回显 args、完整 Document、宿主 secret 或内部 stack。

## 诊断、安全与确定性

- [ ] Plugin Core 复用 Contracts 的诊断 envelope、path、排序、上限和数据最小化规则，且所有 Spec §18 `PLUGIN_CORE_*` code 均进入显式 union。
- [ ] 普通无效输入通过 result 返回，不抛 validation exception。
- [ ] 相同非法输入重复解析得到深相等的 code、path 与顺序。
- [ ] parser、identity helper 和校验流程不修改输入。
- [ ] 成功 parser 输出与输入不共享 object/array reference。
- [ ] 实现不读取时间、随机数、locale、环境变量或全局 registry。
- [ ] canary secret 不出现在 diagnostic message、错误摘要或测试快照中。

## 测试与发布门禁

- [ ] 自定义 type/tagName、Manifest、事件、依赖、能力、贡献和命令白名单逻辑有业务约束测试。
- [ ] dataState 和 contribution discriminated union 的判别与条件必填行为有测试。
- [ ] JSON 危险键、cycle、prototype、资源限制和 detached output 有安全边界测试。
- [ ] Material Catalog 与 Plugin Catalog 的只读性、缺失行为和双实例隔离有测试。
- [ ] 浏览器结构测试验证 Element model property 与标准事件 bubbles/composed。
- [ ] Plugin Core 的纯 lifecycle conformance 覆盖限权与端口失效合同；非法/并发 transition、activate 回滚、deactivate 失败和重复 dispose 的实际运行时行为由后续 Manager Spec 验收。
- [ ] 真实 tarball consumer 可在 Vanilla Node/browser 项目中使用且无需安装 React/Vue。
- [ ] package format、lint、typecheck、test 和 build 全部通过。
- [ ] workspace boundary、API report、publint、ATTW 与 tarball verification 全部通过。
- [ ] 仓库既有 Contracts、Core 与 M0 验证无回归。
- [ ] Spec 的 R1-R13 均有 Requirement → Task → test 及 test → Requirement 双向映射。
