import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Base Screen 的公开界面是自定义元素（`base-screen-*`），由包自身注册；
          // 告诉 Vue 编译器不要把它们当未知组件解析。
          isCustomElement: (tag) => tag.startsWith('base-screen-'),
        },
      },
    }),
  ],
});
