import type React from 'react';
import { useNavigate } from 'react-router-dom';

/** 应用外壳：顶栏（品牌 + 返回列表）+ 主区域。高度链由 CSS 保证。 */
export function AppShell({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const navigate = useNavigate();
  return (
    <div className="shell">
      <header className="shell__header">
        <a
          className="shell__brand"
          href="#/"
          onClick={(event) => {
            event.preventDefault();
            navigate('/');
          }}
        >
          大屏管家 · React
        </a>
        <button type="button" className="button" onClick={() => navigate('/')}>
          返回列表
        </button>
      </header>
      <main className="shell__content">
        <div className="shell__main">{children}</div>
      </main>
    </div>
  );
}
