# Designer Theme Tokens 测试矩阵

> 状态：实施中
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 公共主题契约 | 1、2、4 | `check-designer-styles.mjs` allowlist/映射/私有结构门禁；`designer-style.test.ts` 公共到私有 fallback；DOM case 覆盖 host、ancestor、inline 和删除恢复 |
| R2 dark/light 与覆盖 | 1、2、4、5 | CSS/DOM 测试 dark/light 默认和覆盖优先级；browser harness computed style、contrast、固定几何和当前截图 |
| R3 Token 分级 | 1、2、4、5 | Token inventory、geometry range test、静态拒绝 z-index/layout public Token；各 viewport overflow/layout-shift browser case |
| R4 自有滚动条 | 1、3、4、5 | static owned-container selector audit；Chromium/Safari WebKit 与 Firefox `scrollbar-color` browser evidence；forced-colors system fallback；Material/host scrollbar canary |
| R5 隔离与生命周期 | 2、3、4、5 | 双实例不同主题/Token；Material/Viewer/body/host canary；disconnect/reconnect 和 delayed initialization style node case |
| R6 发布质量 | 4、5 | Engine focused lint/typecheck/test/build；browser harness；API、boundary、tarball、`pnpm verify:m0` |

新增、移动、重命名或删除 case 时，必须同步本矩阵，并在测试名称或相邻注释中标注 R1-R6。
