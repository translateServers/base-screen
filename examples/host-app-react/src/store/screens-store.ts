import { create } from 'zustand';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';
import type { ScreenSummaryShape } from '../types';

const logger = createLogger('screens-store');

/** 列表状态机：任何时刻只能处于其中一种状态，由 store 的动作驱动迁移。 */
export type ScreensStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ScreensState {
  readonly screens: readonly ScreenSummaryShape[];
  readonly status: ScreensStatus;
  readonly error: string | null;
  load(): Promise<void>;
  /** 成功返回新大屏 id，失败返回 null（错误文案已写入 store.error）。 */
  create(name: string): Promise<string | null>;
  remove(id: string): Promise<boolean>;
}

/**
 * 三端一致的状态管理：React 端用 `zustand` 的 `create`，组件内以 selector 订阅
 * （`useScreensStore((s) => s.screens)`），只在选中的切片变化时重渲染。
 * Vanilla / Vue 端是同一份状态语义，换成 `zustand/vanilla` 的 store 与各自订阅方式。
 */
export const useScreensStore = create<ScreensState>()((set, get) => ({
  screens: [],
  status: 'idle',
  error: null,

  async load(): Promise<void> {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    const result = await api.listScreens();
    if (!result.ok) {
      logger.warn('load failed', result.error.code);
      set({ status: 'error', error: result.error.message });
      return;
    }
    set({ status: 'ready', screens: result.data.screens, error: null });
  },

  async create(name: string): Promise<string | null> {
    const result = await api.createScreen(name);
    if (!result.ok) {
      set({ error: result.error.message });
      return null;
    }
    set((state) => ({
      screens: [toSummary(result.data.screen), ...state.screens],
      status: 'ready',
      error: null,
    }));
    return result.data.screen.id;
  },

  async remove(id: string): Promise<boolean> {
    const result = await api.deleteScreen(id);
    if (!result.ok) {
      set({ error: result.error.message });
      return false;
    }
    set((state) => ({
      screens: state.screens.filter((screen) => screen.id !== id),
      error: null,
    }));
    return true;
  },
}));

function toSummary(screen: {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly updatedAt: string;
}): ScreenSummaryShape {
  return {
    id: screen.id,
    name: screen.name,
    revision: screen.revision,
    updatedAt: screen.updatedAt,
  };
}
