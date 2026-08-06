# Third-party vendor licenses

本目录（`packages/engine/src/common/vendor/moveable/`）包含从以下 MIT 许可项目裁剪移植的 TypeScript 源码，
保留上游目录结构与实现，未改动行为逻辑（仅 import 本地化、类型最小化与格式兼容调整）。

## react-moveable (MIT)

Copyright (c) 2019 Daybrush

- 出处: https://github.com/daybrush/moveable/blob/master/packages/react-moveable
- 版本: 0.56.0
- 文件: `snappable/*.ts`、`types.ts`（裁剪）、`consts.ts`（裁剪）、`gestures.ts`（由 `src/gesto/GestoUtils.ts` 裁剪）、`utils.ts`（由 `src/utils.tsx` 裁剪）

## @daybrush/utils (MIT)

Copyright (c) 2019 Daybrush

- 出处: https://github.com/daybrush/utils
- 版本: 1.13.0
- 文件: `utils.ts` 中的函数裁剪（dot/isObject/isNumber/splitUnit/convertUnitSize/average/getRad/getDist/throttle/flat 等）

## @scena/matrix (MIT)

Copyright (c) 2019 Daybrush

- 出处: https://github.com/daybrush/matrix
- 版本: 1.1.1
- 文件: `matrix.ts`

## @egjs/children-differ (MIT)

Copyright (c) 2019 NAVER Corp.

- 出处: https://github.com/naver/egjs-children-differ
- 版本: 1.0.1
- 文件: `diff.ts`（等价重实现，非逐字拷贝）

完整上游 LICENSE 文本见各项目仓库；本目录整体遵循 MIT 许可。
