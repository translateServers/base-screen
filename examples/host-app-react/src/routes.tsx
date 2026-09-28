import type React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ScreenEditorPage } from './components/screen-editor';
import { ScreenListPage } from './components/screen-list';
import { ScreenViewerPage } from './components/screen-viewer';

/** 路由表：与 Vanilla / Vue 两端逐条对等（hash history）。 */
export function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route path="/" element={<ScreenListPage />} />
      <Route path="/screens/:screenId/edit" element={<ScreenEditorPage />} />
      <Route path="/screens/:screenId/view" element={<ScreenViewerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
