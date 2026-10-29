# 三条链路的自检记录（2026-10-29）

> 目的：证明「设计器 / 示例 / 智能体生成」三条链路都能跑通，且用的是同一份契约。
> 环境：Windows + Node 22.22.2，pnpm；共享后端 3000，vanilla/react/vue 分别 5173/5174/5175。

## 1. 设计器链路

| 检查 | 命令 | 结果 |
|---|---|---|
| 引擎类型 | `pnpm --filter @base-screen/engine typecheck` | 通过 |
| 引擎构建 | `pnpm --filter @base-screen/engine exec vite build` | 通过（350 模块） |
| 契约 / 核心测试 | `pnpm --filter @base-screen/core exec vitest run tests/history tests/validation` | 36 通过 |
| 引擎相关测试 | `pnpm --filter @base-screen/engine exec vitest run tests/common/... tests/browser/dom/change` | 37 通过 |
| UI / 样式门禁 | `node tooling/checks/designer-ui.mjs` / `designer-styles.mjs` | 通过 |
| 导入 / 边界 | `pnpm check:engine-import` / `check:boundaries` | 通过 |
| 公共 API 报告 | `pnpm check:api` | 通过（API Extractor 重生成） |

## 2. 示例链路

| 检查 | 结果 |
|---|---|
| `pnpm --filter shared-backend typecheck` | 通过 |
| `pnpm --filter vanilla-host typecheck` | 通过 |
| `pnpm --filter react-host typecheck` | 通过 |
| `pnpm --filter vue-host typecheck` | 通过 |
| `GET http://127.0.0.1:3000/api/health` | 200 |
| `GET http://127.0.0.1:5173/` `5174` `5175` | 均 200 |

三个前端连同一后端，列表里能看到智能体刚生成的大屏，打开同一份文档。

## 3. 智能体链路

真实调用用户提供的 OpenAI 兼容端点（`deepseek-v4.1-flash`），走通「一句话 → 中间表示 →
Screen Document → 落库 → 三端渲染」。

| 检查 | 结果 |
|---|---|
| `POST /api/agent/generate` | 201，`mode: llm`，约 3.7s |
| 生成文档结构 | 51 个组件，类型 `base.rectangle` / `base.text` / `base.image` |
| 契约校验 `parseScreenDocument` | `ok: true` |
| 图片 | 1 个 `base.image`，静态数据源为稳定图片地址 |
| vanilla 5173 渲染 | TTV 1046ms，对比度违规 0，字号违规 0 |
| react 5174 渲染 | TTV 686ms，对比度违规 0，字号违规 0 |
| vue 5175 渲染 | TTV 642ms，对比度违规 0，字号违规 0 |

探针命令：

```bash
node tooling/verification/screen-probe.mjs \
  --url "http://127.0.0.1:5173/#/screens/<id>/view" --max-ttv 8000
```

### 一致性结论

- 三条链路共用 `@base-screen/contracts` 的同一份 schema：智能体产物通过 `parseScreenDocument`，
  三端渲染的就是这份文档，没有第二套结构。
- 对比度与字号在三端结果一致（均为 0 违规）；首次生成时页脚 14px/3.5:1 未达标，
  三端探针都报了出来，改色后复测全部通过——探针确实在起作用，不是摆设。
- 智能体失败时 `mode` 退为 `deterministic` 并带 `failure`，界面与接口都不伪装成模型产物。

## 4. 复跑

```bash
pnpm --filter shared-backend dev     # 3000
pnpm --filter vanilla-host dev       # 5173
pnpm --filter react-host dev         # 5174
pnpm --filter vue-host dev           # 5175
```
