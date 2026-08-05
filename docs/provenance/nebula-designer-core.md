# Nebula Designer Core Provenance

> 状态：生效中
> 最近更新：2026-08-05
> 定位：记录 Designer Product Completion 对 Nebula `screen-editor-core` 的授权参考与逐文件改编边界

## 授权范围

用户于 2026-08-05 确认其可以代表相关版权所有者，并明确授权将指定 Nebula Designer Core 源码或 CSS
改编后纳入 Base Screen，以 MIT 许可证修改和分发。

该授权只覆盖冻结来源中的：

```text
C:\worker\nebula\packages\screen-editor-core
```

来源仓库在记录时 worktree clean，冻结 commit 为：

```text
6e84235897e37af1651f8a84bd5d03aa496c2e35
```

## 排除范围

- `packages/screen-sdk`；
- `apps/web`、`apps/nestjs-server` 与其他应用目录；
- `screen-editor-core` 之外的 Nebula package、配置、样式和资产；
- 第三方生成代码、字体、图标、图片、截图、上传内容及其独立版权；
- Router、认证、数据库、API、dataset DTO、业务 Store 和后端项目生命周期。

被排除内容不得通过 import 追踪、fixture、截图、CSS、bundle 或声明文件间接进入 Base Screen。

## 当前目标文件

本记录当前覆盖以下文档层目标：

| 目标文件 | 来源路径 | 修改范围 | 许可与 attribution 结论 |
| --- | --- | --- | --- |
| `docs/specs/designer-product-completion/spec.md` | `packages/screen-editor-core/src/components/`、`src/hooks/shortcuts-registry.ts`、`src/property-schema/`、`src/blueprint/` | 将可观察的设计器底座能力转写为 Base Screen requirements；不复制实现文本 | 用户授权范围内的行为与结构研究；文档按 MIT 仓库规则分发 |
| `docs/specs/designer-product-completion/tasks.md` | 同上 | 将能力拆为 Base Screen 包边界内的实施任务 | 同上 |
| `docs/specs/designer-product-completion/checklist.md` | 同上 | 将可观察行为转写为独立验收项 | 同上 |
| `docs/specs/designer-product-completion/test-matrix.md` | 同上 | 建立 Base Screen 自有测试映射 | 同上 |
| `docs/provenance/nebula-designer-core.md` | 来源仓库和用户授权声明 | 记录来源、范围、授权和后续逐文件门禁 | 不包含来源源码或资产 |

## 后续实现门禁

每个直接改编或明显衍生的代码、CSS、测试或 fixture 目标文件，必须在修改进入仓库的同一变更中追加：

```text
目标文件：
来源仓库与 commit：
来源路径：
版权所有者授权：2026-08-05 用户确认的改编与 MIT 分发授权
修改范围：
第三方内容排除或许可检查：
许可与 attribution 结论：
复核人和日期：
```

授权不代表必须复制。若来源实现依赖 React、Tailwind、Radix、Moveable、Selecto、React Flow、Zustand 或
Nebula 私有边界，应使用 Base Screen 的 framework-neutral DOM、Core operation、Renderer 和私有 CSS
重新设计；只有确有价值且边界兼容的片段才进行改编。

## Attribution 结论

- 用户已授权指定 `screen-editor-core` 衍生内容以 MIT 分发。
- 第三方许可证和 attribution 仍按具体文件独立复核，本授权不能替代第三方许可。
- 当前只新增文档层行为/结构转写，没有复制 Nebula 源码、CSS、配置或资产。
- 历史 [Nebula Designer Parity](./nebula-designer-parity.md) 继续记录旧归档规格的 no-copy 结论；它不覆盖
  本次范围更窄、授权更明确的 Designer Core 增量。

## 复核

- 复核日期：2026-08-05
- 当前结论：允许在上述范围和逐文件门禁下参考或改编；排除目录与第三方内容继续 fail closed。
