import type React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 应用外壳：顶栏（品牌 + 主导航 + 运行环境标记）+ 主区域。高度链由 CSS 保证。
 *
 * 导航只有两项（大屏 / 数据源），都用 `href="#/..."`：三端共用 hash 路由，
 * 用原生链接而不是 `<Link>` 可以让「新标签页打开」与冒烟的 `page.goto('#/datasources')`
 * 表现一致；`aria-current="page"` 让冒烟与读屏都能判断当前页。
 */
export function AppShell({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const { pathname } = useLocation();
  const onDatasources = pathname.startsWith('/datasources');
  const onScreens = onDatasources === false;
  return (
    <div className="shell">
      <header className="shell__header">
        <a className="shell__brand" href="#/">
          BASE SCREEN <span className="shell__brand-mark">/</span> 数据可视化
        </a>
        <nav className="shell__nav" aria-label="主导航">
          <a
            className={`shell__tab${onScreens ? ' shell__tab--active' : ''}`}
            href="#/"
            {...(onScreens ? { 'aria-current': 'page' as const } : {})}
          >
            大屏
          </a>
          <a
            className={`shell__tab${onDatasources ? ' shell__tab--active' : ''}`}
            href="#/datasources"
            {...(onDatasources ? { 'aria-current': 'page' as const } : {})}
          >
            数据源
          </a>
        </nav>
        <span className="shell__meta">REACT 19 · ENGINE EMBEDDED</span>
      </header>
      <main className="shell__content">
        <div className="shell__main">{children}</div>
      </main>
    </div>
  );
}
