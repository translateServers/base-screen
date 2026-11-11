# Base Screen 文档

本目录只保留设计与决策记录，不承担规范性治理。现行契约以 [AGENTS.md](../AGENTS.md)、
[CONTEXT.md](../CONTEXT.md) 与各包公共导出为准；历史 ADR 正文只存在于 git 历史。

## 决策记录

- [ADR-0089：宿主拥有图片资产与统一资源选择桥](./decisions/ADR-0089-host-owned-image-assets-and-unified-resource-selection.md)
  （已接受，2026-10-25）
- [ADR-0090：宿主在线物料包与 catalog 热刷新](./decisions/ADR-0090-online-material-packages-and-catalog-hot-refresh.md)
  （已接受，2026-10-25）
- [ADR-0091：蓝图关系模型与设计表达](./decisions/ADR-0091-blueprint-relation-model.md)
  （已接受，2026-10-27）
- [ADR-0096：宿主接入辅助包 host-kit](./decisions/ADR-0096-host-kit-rest-adapters.md)
  （已接受，2026-11-11）

## 设计说明

- [宿主图片资产与在线物料：端到端设计](./design/host-assets-and-online-materials.md)
- [宿主素材库与图片选择器 · OpenDesign Brief](./design/host-asset-library-opendesign-brief.md)
- [蓝图关系视图 · 设计说明](./design/blueprint-relations.md)

ADR-0089、ADR-0090 与 ADR-0091 的引擎公共 API、示例后端与三端宿主实现均已落地；后续批次按各 ADR 的“实施切片”继续补充。
