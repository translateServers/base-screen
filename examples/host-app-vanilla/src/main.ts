import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { createAppShell } from './components/app-shell';
import { startRouter } from './router';
import { registerHostMaterials } from './screen/register';

// 1) 注册设计器/查看器/物料（公开入口，幂等）。
registerHostMaterials();

// 2) 挂载应用外壳并启动 hash 路由；高度链由 CSS 保证。
const mount = document.querySelector<HTMLElement>('#app');
if (mount === null) throw new Error('#app mount target is missing.');
const main = document.createElement('div');
main.className = 'shell__main';
const shell = createAppShell(main);
mount.append(shell.root);
startRouter(main);
