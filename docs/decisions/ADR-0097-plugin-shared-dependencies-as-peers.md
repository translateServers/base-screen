# ADR-0097：外围插件的宿主共享依赖改为 peer 依赖

> 状态：已接受
> 日期：2026-11-11
> 关联：ADR-0074（外围插件区与依赖分区，本 ADR 修订其中的依赖钉版条款）、ADR-0075（外围插件兼容策略）、ADR-0096（宿主接入辅助包）。

## 背景

ADR-0074 允许外围插件逐个申报外部依赖，`plugin-echarts` 因此把 `echarts` 作为受控直接依赖，并在
README 中写明"钉版 `echarts@6.1.0`，宿主自带的其它版本会并存而非复用"。

这带来两个问题：

- 宿主自己已经装了 ECharts 时，插件会再装一份，浏览器中同时存在两个实例，体积翻倍；
- 宿主升级 ECharts 时插件不会跟随，两边版本容易悄悄分叉。

项目内绝大多数依赖（框架、图表库）都应以宿主为准。仓库也不接受写死的精确版本号，版本统一用范围声明。

## 决策

1. **宿主提供的共享依赖以 `peerDependencies` 声明，范围与仓库其它位置保持一致**。当前范围为
   `plugin-echarts`：`echarts` 的 `^6.1.0`。
2. **插件自身的开发与测试仍需要该依赖**，因此同一范围同时登记在 `devDependencies`。它只服务于插件的
   tsc 构建、Vitest 与 Biome，不进入发布物的运行时依赖。
3. **宿主应显式安装 peer 依赖**。示例宿主（`vanilla-host`、`react-host`、`vue-host`）均已补上
   `echarts` 直接依赖。实测结果（pnpm 11.18.0 与 npm 10.9.8，临时工程）：
   - 宿主未安装 echarts：pnpm 与 npm 默认都会自动安装 peer，插件解析到该份实例，只有一份。
   - 宿主安装了范围内版本（`^6.1.0`、`^6.0.0`、`latest` 解析为 6.1.0）：两者都只装一份，插件使用宿主的实例。
   - 宿主安装了范围外版本（`^5.6.0`）：pnpm 默认仅警告并使用 5.6.0；npm 默认 ERESOLVE 失败；
     npm `--legacy-peer-deps` 静默使用 5.6.0。
   - 仓库自身的 `.npmrc` 中 `strict-peer-dependencies` / `auto-install-peers` 在 pnpm 11.18.0 下不生效，
     锁文件 `settings.autoInstallPeers` 为 `true`。仓库内的严格检查目前并不存在。
   - tarball 验证通过命令行 `--strict-peer-dependencies` 开启严格模式。
   - 门禁：`verify:tarball` 的 vue-host 消费者安装后，`tooling/verification/single-copy.mjs` 断言
     `echarts` 只有一份，且版本落在宿主声明的范围内（重复副本或范围外版本直接失败）。
4. **白名单不变**：`tooling/checks/boundaries.mjs` 中 `plugin-echarts: ['echarts']` 同时覆盖 peer 与
   dev；外部依赖仍然必须逐插件显式申报，不接受通配。
5. **版本号统一用范围声明**，不在仓库内写死精确版本。这与 React/Vue 桥接包的 peer 范围一致。

## 影响

- `plugin-echarts` 的运行时依赖从 `dependencies` 变为 `peerDependencies`；宿主需要自行声明 `echarts`。
- 仓库内根 `devDependencies` 的 React、Vue、ECharts 改为范围声明后，锁文件在一次非冻结安装中重新解析，
  React 解析到 19.3.1、Vue 解析到 3.5.45 等小版本。该变化只影响仓库内的开发与门禁工具链，不改变对外
  发布的 peer 范围。
- 独立仓库的宿主接入（README 的 tarball 流程）需要同批次安装 `echarts`；这一步在文档中说明。

## 不做的事

- 不把 React/Vue 这类框架依赖重新放入插件的 `dependencies`；它们已经是桥接包的 peer。
- 不引入 pnpm catalog。版本统一以范围声明为准，catalog 留待后续需要时再评估。
