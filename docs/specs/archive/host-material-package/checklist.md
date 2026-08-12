# Acceptance checklist

- [x] `createMaterialPackage` 创建期不访问浏览器全局，返回 `ScreenParseResult`。
- [x] 非法 id、空材料列表、超过 512 项、非对象 options/entry、非数组 materials、非法 manifest、静态 manifest 不一致、重复 type/tagName 均 fail closed 且定位诊断，不抛异常。
- [x] `define()` 注册前对全部 tagName 做冲突预检：任一冲突整体失败且不产生部分注册副作用；同 tagName 冲突返回 `['materials', index, 'tagName']` 诊断；重复调用幂等。
- [x] entries 可直接用于 `createBaseScreenMaterialCatalog`，数据集适配器随条目透传。
- [x] browser-harness 演示宿主受控 `import()` 动态加载 → define（含 auto-register 风格入口）→ 独立 catalog → Viewer 渲染闭环，且不影响主 catalog 与既有断言。
- [x] `pnpm verify:browser` 通过并包含托管包断言（`BROWSER_HARNESS_HOSTED_PACKAGE_FAILED` 分支）。
- [x] Browser harness rejects a document that still references a draft material after unload/reconfigure restoration.
- [x] 文档只引用物料 `type`；无 URL、包名、版本进入文档或 manifest。
- [x] 未新增第十三个 package；contracts、renderer、engine 公共契约无改动。
- [x] test-matrix 将全部 Requirement 映射到自动化证据；相关质量门通过。
