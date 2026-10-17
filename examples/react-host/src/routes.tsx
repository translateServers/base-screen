import type React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { ScreenEditorPage } from './components/screen-editor';
import { ScreenListPage } from './components/screen-list';
import { ScreenViewerPage } from './components/screen-viewer';

/**
 * 路由表：与 Vanilla / Vue 两端逐条对等（hash history）。
 * 宿主外壳只包宿主自有页面（列表）；编辑/查看页把整个视口交给基座，不叠第二层布局——
 * 基座自带顶栏与返回入口，重复一层既抢尺寸链又抢按钮。
 */
export function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell>
            <ScreenListPage />
          </AppShell>
        }
      />
      <Route path="/screens/:screenId/edit" element={<ScreenEditorPage />} />
      <Route path="/screens/:screenId/view" element={<ScreenViewerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
