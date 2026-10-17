import { createStore } from 'zustand/vanilla';
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
 * 三端一致的状态管理：Vanilla 端直接消费 `zustand/vanilla` 的 store
 * （`getState()` 读、`subscribe()` 订阅），不借助任何框架绑定。
 * React / Vue 端是同一份状态语义，只换绑定方式（hook / composable）。
 */
export const screensStore = createStore<ScreensState>()((set, get) => ({
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
    // 新建成功后不整表重拉：把新项插入本地列表，再交给后端顺序保证。
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
