# Conditional Style Port 测试矩阵

> 状态：生效中
> 依据：[spec.md](./spec.md)、[tasks.md](./tasks.md)

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| CSP-P1-C01 | P1 Contracts | plugin-core | [contracts.ts](../../../packages/plugin-core/src/contracts.ts) 端口类型仅类型导出；verify:m0 schema golden 无变化 |
| CSP-P2-C01 | P2 Renderer | Renderer | renderer.test.ts「merges base → document rules → port overrides with per-key override」 |
| CSP-P2-C02 | P2 Renderer | Renderer | renderer.test.ts「receives componentId with the full dataState and re-evaluates on refresh」（loading 首调 + 刷新重评估 + 回退） |
| CSP-P2-C03 | P2 Renderer | Renderer | renderer.test.ts「fails closed on an invalid override」（忽略覆盖、保留 base+规则、恰一条诊断、渲染 ok） |
| CSP-P2-C04 | P2 Renderer | Renderer | renderer.test.ts「isolates a throwing resolve」（抛异常组件回退、其他组件不受影响） |
| CSP-P2-C05 | P2 Renderer | Renderer | renderer.test.ts「keeps a port-less renderer and an undefined-returning port byte-identical」 |
| CSP-P3-C01 | P3 Viewer | Renderer | viewer-configure.test.ts「accepts a valid conditional style port and rejects an invalid one atomically」 |
| CSP-P3-C02 | P3 Designer | Engine | designer-runtime-config.test.ts「accepts a valid conditional style port and rejects an invalid one atomically」 |
| CSP-P4-C01 | P4 Harness | Browser | verify-browser-harness.mjs `BROWSER_HARNESS_STYLE_PORT_*`（port-warning 跨界变橙、回落复原；文档零 styleRules） |
