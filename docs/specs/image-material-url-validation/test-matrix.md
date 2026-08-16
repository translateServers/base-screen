# Image Material URL Validation Test Matrix

> 状态：进行中

| 需求 | 聚焦单元测试（material） | 浏览器 harness 验证 |
| --- | --- | --- |
| R1 URL 校验 | https://、//host/x、/root、./rel 渲染 img；data:/javascript:/裸相对/控制字符/超限显示占位 | 非法 URL 显示「图片地址无效」且无 img |
| R2 失败回退 | error 事件 → 占位；重建不残留 | 404 地址显示「图片加载失败」 |
| R3 状态文案 | host-resource 字符串同规则 | 占位文案与既有状态一致 |
| R4 质量 | 全部聚焦测试通过 | `pnpm verify:browser` 断言通过 |
