# ADR-0069: 独立数据集消费契约

> 状态：已接受
> 日期：2026-09-05
> 依据：用户已确认的数据体系重构方案

## 决策

以 ScreenHostDatasetPort 统一数据集分组、目录、描述和查询。规范数据源增加 dataset，只保存不透明发布标识、参数意图和字段角色绑定。host-resource 继续表达非表格宿主资源。

数据集参数由具体描述拥有，不再由资源类型 configSchema 拥有。Contracts 定义严格参数和结果；Core 进行纯求值及绑定；Engine 提供作者面；Renderer 负责有界调用、实例内请求合并、取消和安全投影。宿主拥有来源、权限、发布、执行、凭据和刷新调度。

元数据和查询共用一次执行预算。失败、取消及迟到响应不会写入文档。字段绑定变更仅触发本地投影，实际参数变更才更新查询身份。

## 取代范围

本决策取代 [ADR-0023](./ADR-0023-host-dataset-resource-integration.md) 的数据集共用 host-resource 及目录/查询分离契约，取代 [ADR-0025](./ADR-0025-data-runtime-hardening.md) 的类型级数据集参数权威及宿主特定资源分类。保留其严格校验、错误投影、有界共享和取消语义。

## 切换

实现按 [独立数据集规格](../specs/independent-dataset-consumption/spec.md) 推进。旧数据集端口和表格 host-resource 路径在联合切换时退出，不增加兼容解析分支。宿主负责旧配置盘点、备份、重建和恢复；本决策不授权生产操作。
