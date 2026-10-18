import type React from 'react';

/** 应用外壳：顶栏（品牌 + 运行环境标记）+ 主区域。高度链由 CSS 保证。
 *  列表页已经是根路由，「返回列表」在这里没有去处，因此不放按钮。 */
export function AppShell({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div className="shell">
      <header className="shell__header">
        <a className="shell__brand" href="#/">
          BASE SCREEN <span className="shell__brand-mark">/</span> 数据可视化
        </a>
        <span className="shell__meta">REACT 19 · ENGINE EMBEDDED</span>
      </header>
      <main className="shell__content">
        <div className="shell__main">{children}</div>
      </main>
    </div>
  );
}
