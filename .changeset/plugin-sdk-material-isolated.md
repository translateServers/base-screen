---
'@base-screen/plugin-sdk': minor
'base-screen': minor
---

新增 L3 隔离代码物料（ADR-0117 S1）：作者代码只在沙箱 iframe 里运行，宿主 realm 不执行任何作者代码。

- `createBaseScreenIsolatedMaterialDefinition({ spec, source, tagName, libraries })`：产出普通物料构造器，Engine / renderer 无感；Manifest 与表格适配器从规格派生；
- 同一文档里同一个包的实例共用一个 `srcdoc` iframe（只给 `allow-scripts`），CSP `default-src 'none'`、脚本按内容哈希放行（不用 nonce），无网络能力；
- 画面在 iframe 里画成位图转移回宿主（`bitmaprenderer`），每实例限帧（默认 60）；宿主每帧给每个包下发一条 tick，iframe 不依赖自己的 rAF；
- 桥协议只认握手交出的私有端口，入站消息类型白名单、字段精确匹配、64 KiB 上限；事件名须在 Manifest 里、每实例每秒最多 20 条；连续出错、握手超时与卡死触发熔断，整个包换成错误视图，`onAudit` 上报；
- 规格新增 `isolated: { libraries? }`（宿主预置库名），与 `template` 互斥；带 `isolated` 的规格不能交给 `createBaseScreenSpecMaterialDefinition`；
- 没有 `crypto.subtle`（非安全上下文）时用内置 `sha256` 计算 CSP 哈希。
- 握手超时会先诊断再熔断（ADR-0117 §9.8）：沙箱文档没加载完记为 `startup`（组件代码在加载阶段没有结束）；加载完了就用最小探针沙箱试一次，探针也跑不起来记为 `host-csp`（srcdoc 沙箱继承了宿主页面的 CSP），错误视图直接写明原因；审计记录新增可选 `cause` 字段（`BaseScreenIsolatedMaterialCircuitCause`）。
- 沙箱文档改走网络导航（ADR-0118 N1）：新增可选的沙箱宿主端口 `sandbox.resolve(document)`，配置后沙箱 iframe 用宿主路由返回的 http(s) 地址加载，文档只受路由响应头里的 CSP 约束，不再继承宿主页面的 CSP；未配置时照旧用 `srcdoc`。握手口令改由 iframe 的 `name` 属性带入（引导读完即清空），沙箱文档因此每包恒定，可按内容哈希寻址；新增 `buildBaseScreenIsolatedSandboxDocument`、`BaseScreenIsolatedSandboxDocument` / `BaseScreenIsolatedSandboxHost`，以及无依赖的 `material-isolated-csp`（`buildBaseScreenIsolatedSandboxCsp` 只采纳严格校验过的脚本哈希，其余指令写死并带 `sandbox allow-scripts`）。网络导航模式下监听宿主的 `frame-src` 违规，熔断原因新增 `sandbox-route`。
