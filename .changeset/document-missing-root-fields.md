---
"@base-screen/contracts": patch
---

文档缺少 `canvas` 或 `blueprint` 时解析失败关闭并给出诊断；此前这两个字段缺失会跳过结构校验，
在引用校验里抛出 `TypeError`。
