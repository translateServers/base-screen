---
'@base-screen/contracts': minor
'@base-screen/core': minor
'base-screen': minor
---

示例数据标记（ADR-0112 S2 契约部分）：

- contracts：`ScreenValueRef` 的 `inline` 分支新增可选 `sample?: true`，只能写 `true`，缺省即普通常量；JSON Schema 黄金产物同步。新增诊断码 `PUBLISH_SAMPLE_DATA_PRESENT`。
- core：新增 `listSampleValueRefs(document)`，按文档顺序列出组件 `dataValue`、数据源参数、变量值三处带标记的取值，不深扫 props / style。
