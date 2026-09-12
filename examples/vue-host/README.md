# Vue Host

一个**完整的现代 Vue 工程**，演示宿主如何用自己的 Vue 应用承载 Base Screen 设计器。
它不只是"能跑起来的示例"：`verify:tarball` 会把它复制到仓库外、换成同批次的真实 tarball
再跑一遍 typecheck / build / 浏览器闭环，所以它同时是"外部消费者"的验证载体。

```bash
pnpm install
pnpm --filter @base-screen-example/vue-host dev     # 起 Vite dev server
pnpm --filter @base-screen-example/vue-host build
pnpm --filter @base-screen-example/vue-host typecheck
```

## 这个工程演示了什么

| 关注点 | 在哪 | 说明 |
| --- | --- | --- |
| 宿主自有 Vue 物料 | `src/components/ProductCard.vue` + `src/screen/product-card.ts` | 普通 Vue SFC 经 `@base-screen/vue` 桥接成设计器物料 |
| 宿主自有插件 | `src/screen/host-plugin.ts` | 声明自己的物料贡献 + 一条 `design.read` / `command.execute` 命令 |
| 注册编排 | `src/main.ts` 第 4 步 | `createPluginRegistration` 一次调用完成冲突预检与元素注册 |
| 快照回灌 | `src/main.ts` 第 7 步 | 目录/贡献索引/面板/控件全部取自 `manager.snapshot`，不重建副本 |
| 宿主项目存取 | `src/screen/project-adapter.ts` | 宿主维护 `revision` 并实现 `load`/`save`；发布明确不支持 |
| 宿主应用外壳 | `src/App.vue`、`src/components/HostToolbar.vue` | 顶栏按钮只经公共 API（贡献命令、`undo()`）驱动设计器 |

## 接入时最容易踩的几个坑

这些都是本工程实际踩到并修掉的，写在这里省下别人同样的时间：

1. **先挂载，再 `configure`/`load`。** 画布与渲染器在自定义元素 *connected* 时才建立。
   对一个还没进 DOM 的设计器调用 `configure`/`load` 不报错，但画布内容会一直是空的。
2. **高度链要给全。** `html, body → #host-app → .host-shell → .host-stage` 每一层都要有确定高度；
   漏掉任何一层，设计器只拿到 `min-height`，画布测量会失真。另外设计器有容器查询：
   容器窄于 1021px 或矮于 637px 时会整屏切换成"可用空间不足"提示。
3. **设计器是 DOM 节点，不是 Vue 组件。** 用 `ref` 拿到占位容器后在 `onMounted` 里
   `appendChild`，不要塞进 vnode；用 `shallowRef` 避免 Vue 代理整个设计器实例。
4. **`update-components` 的 `patch` 按顶层键整体替换。** 只想改 `props.stock` 时必须把
   完整 `props` 拼出来；只发 `{ stock }` 会丢掉同样必填的 `title`，被物料 `propsSchema` 拒绝。
   正确写法见 `src/screen/host-plugin.ts`（先 `design.read` 读现状，再拼完整对象写回）。
5. **物料样式必须满足自身 `styleSchema`。** 例如 `base.text` 的 `fontWeight` 是枚举
   `'400' | '700'`，写数字 `600` 会在文档提交时失败。
6. **工具链版本**：本工程用 `vue-tsc` 做 SFC 类型检查，因此 devDependencies 里固定
   TypeScript `5.9.3`——当前 `vue-tsc` 尚不支持仓库根使用的 TypeScript 7（其 `exports`
   不再暴露 `./lib/tsc`）。Vite 侧不受影响。

## 与其它示例的分工

- `examples/host-quickstart`：最小 Viewer，只读、无插件。
- `examples/browser-harness`：基座自己的完整特性矩阵与 Playwright 断言。
- `examples/vue-host`（本工程）：**宿主视角**——自建 Vue 应用 + 自有物料 + 自有插件，
  并经真实 tarball 外部消费验证。

`src/main.ts` 的注释按 1–8 步编号，跟着读一遍即可看清完整接入顺序。
