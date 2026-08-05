# 目录结构与构建产物规则 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)

本清单按 Spec R1-R9 验收。每一项必须由当前代码、目录状态和自动化脚本证据勾选；不得仅凭计划或意图勾选。

## 文档与边界

- [ ] `directory-structure-rules` 已登记到 `docs/specs/README.md` 生效索引。
- [ ] 本整改不改变公共 `exports`、类型签名或依赖白名单（R9）。
- [ ] 包数量与包清单不变（`check-packages.mjs` 通过）。
- [ ] 不需要新增 ADR；若实现触及公共边界，先提交对应 ADR（R9 / §3）。

## R1 src 为唯一发布物

- [ ] 12 个包 `src/` 下无任何 `*.test.ts`。
- [ ] 12 个包 `src/` 下无 `__fixtures__/` 目录。
- [ ] 迁移前发现的全部测试文件均已迁至同包 `tests/`，子目录与 `src/` 镜像；不使用固定文件数验收。
- [ ] `core/src/__fixtures__/document.ts` 已迁至 `tests/__fixtures__/`。
- [ ] 外置后测试相对 import 已更新，Vitest 仍发现全部迁移测试（`tests/*.test.ts` 命名保持 `*.test.ts`）。

## R2 engine 垂直分层

- [ ] `engine/src` 存在 `common/` 与 `browser/` 两个顶层目录。
- [ ] `common/` 内无未被词法绑定的浏览器全局 `window` / `document` / `globalThis` 引用；领域对象或参数名为 `document` 可保留。
- [ ] `common/` 不 import `browser/`（含传递依赖闭包）。
- [ ] 依赖方向单向：`browser/` 可依赖 `common/`，反向禁止。
- [ ] `common/` 归入：`operations/`、`session/`、`project/`、`tools/`、`ui-text/`。
- [ ] `browser/` 归入：`controllers/`、`dom/`、`viewport/`、`styles/`、`ui/designer-icons`。

## R3 controllers 拆分

- [ ] `controllers/project-controller.ts` 已迁入 `common/project/`。
- [ ] 其余 `designer-*-controller.ts` 保留于 `browser/controllers/`。
- [ ] `designer-*-controller` 中混入的纯逻辑已按 R2 下沉 `common/`（逐文件核实 DOM 引用）。
- [ ] `designer-session` 依赖的 `ScreenProjectController` 处于 `common/`，未触碰 `browser/`。

## R4 构建产物卫生

- [ ] 所有包 `tsconfig.build.json` 设置 `rootDir: "src"`、仅 include `src`，并排除 `src/**/*.test.ts` 与 `src/**/__fixtures__/**`。
- [ ] `engine/tsconfig.build.json` 已补齐测试/fixture 排除（原缺失）。
- [ ] `core/dist/__fixtures__/` 已清除，重新构建后不再出现。
- [ ] 所有 `dist` 不含 `*.test.*` 或 `__fixtures__` 产物。
- [ ] `files: ["dist"]` 与 `exports` 不变。

## R5 依赖注入解耦约定

- [ ] `common/`、`core` 与 `contracts` 的纯逻辑模块需要环境能力时，通过构造 options 注入回调访问。
- [ ] 未引入 DI 容器、store、Router 或新增第三方依赖。
- [ ] `core`、`contracts` 不访问 DOM/global；`plugin-*` 不在运行时访问 DOM/global，公共 ABI 的 type-only DOM 类型除外。

## R6 命名前缀语义

- [ ] `Screen*` 用于 canonical document、事务、项目等领域概念，不以所属 package 判定。
- [ ] `Designer*` 仅用于设计器编排层。
- [ ] `BaseScreen*` 用于 Base Screen 平台命名空间中的跨层契约或组件，尤其是公共 API。
- [ ] 未删除既有前缀；新增类型按层级选择前缀。

## R7 增量门禁

- [ ] `check-engine-import.mjs`: 基于 AST 作用域的 `common/` 未绑定浏览器全局引用检查生效。
- [ ] `check-engine-import.mjs`: `common/` 依赖闭包不含 `browser/` 检查生效。
- [ ] `check-boundaries.mjs`: `collectSourceFiles` 同时扫描 `src/` 与 `tests/`。
- [ ] `tests/` 内跨包导入同样受边界约束。
- [ ] `check-packages.mjs` 对 `src/` 测试/fixture、build tsconfig source-only 配置及 build 后 `dist/` 卫生检查生效。
- [ ] `check-designer-ui.mjs`、`check-designer-styles.mjs` 路径已随迁移更新。
- [ ] `check:api` 显示公共 API 与整改前一致（R9）。

## R8 文档同步

- [ ] `AGENTS.md` 目录约定更新：测试外置、`common/browser` 边界、命名前缀语义。
- [ ] provenance 受影响路径（如 `lucide-designer-icons.md`）已同步。
- [ ] `docs/specs/README.md` 已登记本 Spec。

## R9 公共边界不变证

- [ ] `pnpm format` / `format:check` 通过。
- [ ] `pnpm lint`（含 check-boundaries）通过。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm test` 通过（含外置后全部测试）。
- [ ] `pnpm build` 通过，`dist` 干净。
- [ ] `pnpm check:packages` 通过。
- [ ] `pnpm check:api` 通过且无公共 API 变化。
- [ ] `pnpm check:engine-import` 通过。
- [ ] `pnpm verify:tarball` 通过。
- [ ] `pnpm verify:m0` 全绿。

## 验收场景

- [ ] 场景 A：`pnpm check:packages` 对 `src/` 内任一 `*.test.ts` 或 `__fixtures__/` 均失败。
- [ ] 场景 B：所有 `dist` 不含 `__fixtures__` / `*.test.*` 产物。
- [ ] 场景 C：`common/` DOM 与 `browser/` 依赖闭包违规即报错。
- [ ] 场景 D：`check-boundaries` 对 `tests/` 内跨包导入生效。
- [ ] 场景 E：`pnpm verify:m0` 全绿，`check:api` 公共 API 无变化。
