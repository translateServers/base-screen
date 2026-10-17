import { defineConfig } from 'vite';

// 前后端分离联调：dev server 把 /api 代理到共享 NestJS 后端（见 examples/shared-backend）。
// 生产构建不依赖代理——API Base 在运行时解析（src/lib/api-base.ts）。
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3222,
  },
});
