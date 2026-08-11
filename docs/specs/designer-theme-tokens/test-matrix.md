# Designer Theme Tokens 测试矩阵

> 状态：已完成
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 公共主题契约 | 1、2、4 | `check-designer-styles.mjs` allowlist/映射/私有结构门禁；`designer-style.test.ts` 公共到私有 fallback；browser harness `assertDesignerControlStyles` 覆盖 inline、宿主 author stylesheet、祖先继承、删除覆盖后的级联恢复 |
| R2 dark/light 与覆盖 | 1、2、4、5 | `designer-style.test.ts` R2 contrast 审计（普通正文 4.5:1、focus/semantic 3:1）与 reduced-motion/forced-colors 静态断言；browser harness computed style、固定几何和当前截图 |
| R3 Token 分级 | 1、2、4、5 | Token inventory、geometry range test、静态拒绝 z-index/layout public Token；各 viewport overflow/layout-shift browser case |
| R4 自有滚动条 | 1、3、4、5 | `check-designer-styles.mjs` owned-container selector audit 与 `body`/host scrollbar 拒绝；`designer-style.test.ts` R4 静态 scope 断言（含 forced-colors `scrollbar-color: auto`）；Chromium harness 真实验证 WebKit pseudo-element 路径；标准 `scrollbar-color` 规则同时覆盖 Firefox 支持路径。本环境未安装 Firefox/Safari，Firefox 与 WebKit 路径以共享标准规则 + 静态门禁 + Chromium 实测作为等价证据 |
| R5 隔离与生命周期 | 2、3、4、5 | `assertDesignerControlStyles` 验证 Material（canary）/Viewer/host 字体与控件尺寸不受影响；`assertDesignerThemeIsolation` 验证双实例不同 theme/Token、style node 唯一、disconnect/reconnect 与 catalog 延迟初始化不累积；`designer-style.test.ts` R11 状态不依赖单色 |
| R6 发布质量 | 4、5 | Engine focused lint/typecheck/test/build；browser harness；API、boundary、tarball、`pnpm verify:m0` |

新增、移动、重命名或删除 case 时，必须同步本矩阵，并在测试名称或相邻注释中标注 R1-R6。
