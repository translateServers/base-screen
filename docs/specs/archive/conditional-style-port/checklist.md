# Conditional Style Port Checklist

> Status: Accepted
> Updated: 2026-08-17
> Authority: ADR-0059

- [x] 端口类型仅存在于 plugin-core 与运行时配置面；文档、JSON Schema、序列化零变化。
- [x] 三层合并顺序固定：base → 文档 styleRules → 端口覆盖；同键后写覆盖先写。
- [x] 端口覆盖经 styleSchema 校验，非法覆盖不抵达物料且恰一条诊断；异常同路径隔离。
- [x] 无端口实例行为与现状逐字节一致；文档 styleRules 语义不变。
- [x] Viewer/Designer configure 形状校验失败零副作用；守卫 setter + 只读 getter 与 resourcePort 同形。
- [x] effective style 不回写文档、不产生历史记录。
- [x] `pnpm verify:m0` 与 `pnpm verify:browser` 通过；测试矩阵覆盖全部需求。
