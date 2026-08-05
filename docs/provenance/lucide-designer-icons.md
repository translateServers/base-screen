# Lucide Designer Icons Provenance

> 状态：已记录
> 最近更新：2026-08-04
> 定位：记录 Engine 私有 Designer 图标的外部 SVG 来源、授权和本地修改。

## 目标文件

- `packages/engine/src/ui/designer-icons.ts`

## 来源仓库与 Commit

- Repository：`https://github.com/lucide-icons/lucide`
- Commit：`1d7da164bbaf684159accdfd3d568d82b87d54bd`
- License blob：`718bb3f0e44153809972abed31839375804bf652`

## 来源路径

- `icons/mouse-pointer-2.svg`（blob `b881f79518d2ae5012aaa81792cb4dd075548771`）
- `icons/undo-2.svg`（blob `3e93594c0a400186e7f6e8f1d3981dc82cffe7e8`）
- `icons/save.svg`（blob `07af0708302018606f9619adb2d4d6ec2175db57`）

## 版权所有者授权

Lucide Icons and Contributors 在上游 LICENSE 中以 ISC License 授予使用、复制、修改和分发许可。

## 修改范围

- 删除上游 `<svg>` 的 XML、尺寸和演示属性，仅保留三个 path 片段。
- 由 Engine 私有 `designerIcon()` 统一包装为 24x24 `currentColor` SVG。
- 图标不作为 package export，不添加依赖、资源文件、网络请求或公共 API。

## 许可与 Attribution 结论

- 上游 ISC License 与本仓库 MIT 发布兼容；本记录保留作者和许可出处。
- 仅复制以上三个 SVG path；其余 Designer 图标仍为 Base Screen 自有实现，未声明 Lucide 来源。

## 复核

- 复核人和日期：Codex，2026-08-04
- 结论：允许将上述经修改 SVG path 作为私有 Engine 实现随 MIT 产物发布。
