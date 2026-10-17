declare global {
  interface Window {
    /** 运行时注入的后端地址（冒烟脚本与分离部署使用；同一产物可切换后端）。 */
    __HOST_APP_CONFIG__?: { readonly apiBaseUrl?: string };
  }
}

const FALLBACK_BASE = '/api';

/**
 * API Base 解析优先级：运行时注入 > 构建期环境变量 > 同源相对路径。
 * 同源相对路径同时覆盖 dev（Vite proxy）与同源静态托管两种部署。
 */
export function resolveApiBase(): string {
  const injected = window.__HOST_APP_CONFIG__?.apiBaseUrl;
  if (typeof injected === 'string' && injected.length > 0) return injected;
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return FALLBACK_BASE;
}
