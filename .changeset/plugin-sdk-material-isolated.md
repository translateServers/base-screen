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
