# 目录结构与构建产物规则 任务

> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)

本任务集按 R1-R9 拆分为原子执行步骤。每完成一个 Task 后运行对应聚焦检查；涉及包/构建产物/公共契约的改动，先运行 `pnpm verify:m0`。所有迁移使用 `git mv` 保留历史。

- [x] Task 1：修构建产物卫生（R4）。
  - [x] 为全部 12 包 `tsconfig.build.json` 明确 `include: ["src/**/*.ts"]` 与 `rootDir: "src"`，加入 `exclude: ["src/**/*.test.ts", "src/**/__fixtures__/**"]`；保留已有的非测试排除项（engine 原缺失，补齐）。
  - [x] 清理陈旧产物：删除 `core/dist/__fixtures__/`，各包重跑 `pnpm build`。
  - [x] 验证所有 `dist` 不含 `__fixtures__` / `*.test.*`。
  - [x] 聚焦检查：`pnpm --filter <pkg> build` + `pnpm check:packages`。

- [x] Task 2：engine 拆分 `common/` / `browser/`（R2、R3）。
  - [x] 逐文件核实 DOM 依赖，以 AST 作用域区分未绑定浏览器全局与 `ScreenDocument` 等局部领域符号，建立归因表。
  - [x] `git mv`：`operations/`、`session/`、`tools/`、`ui/designer-ui-text` → `common/`；`controllers/project-controller.ts` → `common/project/`。
  - [x] `git mv`：`dom/`、`viewport/`、`styles/`、`ui/designer-icons`、其余 `controllers/designer-*-controller` → `browser/`。
  - [x] 更新全部相对导入路径（`../controllers/...` → `../common/...` / `../browser/...`）。
  - [x] 更新 `check-designer-ui.mjs`、`check-designer-styles.mjs` 及 provenance `lucide-designer-icons.md` 路径。
  - [x] 聚焦检查：`pnpm --filter @base-screen/engine typecheck` + `pnpm --filter @base-screen/engine test`。

- [x] Task 3：测试全量外置（R1）。
  - [x] 12 包 `git mv` `src/**/*.test.ts` → `tests/**`（镜像 `src/` 子目录）。
  - [x] `core/src/__fixtures__/` → `tests/__fixtures__/`。
  - [x] 更新测试的相对 import，使其从 `tests/` 正确引用 `src/` 模块与 fixture。
  - [x] 各包 `tsconfig.json` 设置 `rootDir: "."` 并 include `["src/**/*.ts", "tests/**/*.ts"]` 供 typecheck；`tsconfig.build.json` 覆写为 `rootDir: "src"` 且仅 include `src`。
  - [x] 以迁移前的文件清单为基线确认 Vitest 仍发现全部迁移测试；不得使用固定测试文件数作为验收条件。
  - [x] 聚焦检查：`pnpm --filter <pkg> typecheck` + `pnpm --filter <pkg> test`。

- [x] Task 4：增量门禁（R7）。
  - [x] `check-engine-import.mjs`：新增基于 AST 作用域的 `common/` 未绑定浏览器全局引用检查。
  - [x] `check-engine-import.mjs`：新增 `common/` 依赖闭包（DFS import 图）不含 `browser/` 检查。
  - [x] `check-boundaries.mjs`：`collectSourceFiles` 同时扫描 `src/` 与 `tests/`。
  - [x] `check-packages.mjs`：新增 `src/` 测试/fixture、build tsconfig source-only 配置及 build 后 `dist/` 卫生检查。
  - [x] 触发违规用例验证门禁确实报错。
  - [x] 聚焦检查：`pnpm check:engine-import` + `pnpm check:boundaries`。

- [x] Task 5：文档同步（R8、R6）。
  - [x] 更新 `AGENTS.md`：测试外置到 `tests/`、engine `common/browser` 边界、命名前缀语义（`Screen*`/`Designer*`/`BaseScreen*`）。
  - [x] 更新 `docs/specs/README.md`：登记本 Spec 到生效索引。
  - [x] 更新 provenance 受影响路径。
  - [x] 聚焦检查：`pnpm lint`。

- [x] Task 6：全量验收（R9、DoD）。
  - [x] 运行 `pnpm verify:m0` 全绿。
  - [x] `pnpm check:api` 确认公共 API 较整改前无变化。
  - [x] 场景 A-E 全部通过（见 checklist）。
  - [x] 反向核对 R1-R9 与 checklist 逐项证据，勾选完成。

## 执行顺序与依赖

`Task1 → Task2 → Task3 → Task4 → Task5 → Task6`。Task 4 依赖 Task 2/3 的目录落地；Task 6 为最终全量门禁。每步聚焦检查通过后再进入下一步。
