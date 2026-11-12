---
'@base-screen/host-kit': minor
---

新增宿主接入辅助包 `@base-screen/host-kit`：`createHttpProjectAdapter` 与 `createRestDatasetPort`
收编示例里反复手抄的项目适配器与数据集端口样板，内置契约硬规矩（剥 groups、signal 第二参、不下发
componentId、错误码映射）与取消语义。仅依赖 contracts，可选使用，不改变既有公共契约。见 ADR-0096。

各操作可通过 `mapping` 分别投影请求路径、方法、JSON body 与响应 envelope；投影结果仍经 canonical
解析。项目自定义映射保留 opaque revision，数据集查询保留 boolean 参数和分页 cursor。请求或响应
映射抛错会转为端口诊断，取消仍返回空诊断。底层 `HostKitHttp.request<T>()` 保持兼容。