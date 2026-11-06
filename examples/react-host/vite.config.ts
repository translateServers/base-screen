import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 前后端分离联调：dev server 把 /api 代理到共享 NestJS 后端（见 examples/shared-backend）。
// 生产构建不依赖代理——API Base 在运行时解析（src/lib/api-base.ts）。
export default defineConfig({
  plugins: [react()],
  // 桥接包声明的是 React peer 范围；宿主构建时统一解析到应用自己的 React。
  // 避免 pnpm 为 workspace 包自动解析另一份 peer 而产生两个 dispatcher。
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3220,
  },
});
