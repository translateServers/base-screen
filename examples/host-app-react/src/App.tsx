import type React from 'react';
import { AppShell } from './components/app-shell';
import { AppRoutes } from './routes';

export function App(): React.ReactElement {
  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}
