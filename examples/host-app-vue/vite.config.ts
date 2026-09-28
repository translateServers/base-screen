import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// 前后端分离联调：dev server 把 /api 代理到共享 NestJS 后端（见 examples/host-api）。
// 生产构建不依赖代理——API Base 在运行时解析（src/lib/api-base.ts）。
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 设计器/查看器与宿主自有物料都是 Custom Element，不走 Vue 组件编译。
          isCustomElement: (tag) => tag.startsWith('base-screen-') || tag.startsWith('host-app-'),
        },
      },
    }),
  ],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3221,
  },
});
