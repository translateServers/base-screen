# Material Library Visibility 任务

> 状态：已完成
> 当前进行：无
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

- [x] Task 1：落地 Manifest 可见性契约（R1）。
  - [x] `BaseScreenMaterialManifest` 增加可选 `libraryVisible: boolean`，缺失即默认可见。
  - [x] Plugin Core 对存在字段做严格布尔校验，非法值返回 `PLUGIN_CORE_MANIFEST_FIELD_INVALID`；字段不进入必填集。

- [x] Task 2：Designer 物料库过滤（R2）。
  - [x] 物料卡片构建与面板计数只消费 `libraryVisible !== false` 的目录条目。
  - [x] 过滤只发生在物料库展示层，catalog 查询、注册、渲染、层板与 Group 命令不感知可见性。

- [x] Task 3：官方容器物料声明与浏览器证据（R3）。
  - [x] 容器 manifest 声明 `libraryVisible: false`。
  - [x] browser harness 改为通过编组流程创建容器，并断言容器卡片不再出现在物料库。

- [x] Task 4：证据与质量门。
  - [x] Plugin Core 解析 case：缺失默认可见、布尔合法、非布尔拒绝。
  - [x] Material manifest case 与 Engine 过滤 helper case。
  - [x] 更新测试矩阵与 ADR 引用，运行受影响检查与 `pnpm verify:m0`。
