import { createStore } from 'zustand/vanilla';

/**
 * 当前大屏会话的状态机（编辑页与查看页共用）。
 *
 * 迁移图：
 *   idle ──begin──▶ loading ──loaded──▶ ready ──dirty──▶ dirty ──saving──▶ saving
 *                                        ▲                                    │
 *                                        └────────── saved ◀──────────────────┘
 *   saving ──failed──▶ failed（可重试）   saving ──conflicted──▶ conflict（须重载）
 *   loading ──failedToLoad──▶ error（终态，需返回列表）
 *
 * 状态文案由 store 统一生成，三个前端因此显示同一套文案。
 */
export type SessionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'conflict'
  | 'error';

export interface ScreenSessionState {
  readonly screenId: string | null;
  readonly status: SessionStatus;
  readonly message: string;
  readonly revision: string | null;
  readonly error: string | null;
  begin(screenId: string): void;
  loaded(name: string, revision: string): void;
  dirty(): void;
  saving(): void;
  saved(revision: string): void;
  failed(reason: string): void;
  conflicted(): void;
  failedToLoad(reason: string): void;
  reset(): void;
}

export const screenSessionStore = createStore<ScreenSessionState>()((set) => ({
  screenId: null,
  status: 'idle',
  message: '',
  revision: null,
  error: null,

  begin(screenId: string): void {
    set({ screenId, status: 'loading', message: '正在加载大屏…', revision: null, error: null });
  },
  loaded(name: string, revision: string): void {
    set({ status: 'ready', message: `已加载：${name}（版本 ${revision}）`, revision, error: null });
  },
  dirty(): void {
    set({ status: 'dirty', message: '有未保存的更改' });
  },
  saving(): void {
    set({ status: 'saving', message: '正在保存…' });
  },
  saved(revision: string): void {
    set({ status: 'saved', message: `已保存（版本 ${revision}）`, revision, error: null });
  },
  failed(reason: string): void {
    set({ status: 'failed', message: `保存失败：${reason}`, error: reason });
  },
  conflicted(): void {
    set({
      status: 'conflict',
      message: '保存冲突：请重新加载',
      error: '文档已被其他会话更新，请刷新页面重新加载。',
    });
  },
  failedToLoad(reason: string): void {
    set({ status: 'error', message: '加载失败', error: reason });
  },
  reset(): void {
    set({ screenId: null, status: 'idle', message: '', revision: null, error: null });
  },
}));
