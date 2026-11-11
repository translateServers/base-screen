---
'@base-screen/host-kit': minor
---

新增宿主接入辅助包 `@base-screen/host-kit`：`createHttpProjectAdapter` 与 `createRestDatasetPort`
收编示例里反复手抄的项目适配器与数据集端口样板，内置契约硬规矩（剥 groups、signal 第二参、不下发
componentId、错误码映射）与取消语义。仅依赖 contracts，可选使用，不改变既有公共契约。见 ADR-0096。