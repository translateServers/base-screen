import { onScopeDispose, type ShallowRef, shallowRef } from 'vue';
import { type ScreenSessionState, screenSessionStore } from '../store/screen-session-store';
import { type ScreensState, screensStore } from '../store/screens-store';

/**
 * 把 zustand store 桥接进 Vue 响应式系统：store 仍是唯一的真源，
 * composable 只维护一份浅层快照（shallowRef），store 每次变更后同步一次。
 * 这样 Vue 组件照常用模板消费，而状态迁移逻辑与三端保持一致。
 *
 * 桥接是显式写两遍的（而不是抽一个泛型 helper）：泛型版在 vue-tsc 下会命中
 * `shallowRef` 的重载歧义，显式参数既避免该问题，也让两个 store 的绑定一眼可读。
 */
export function useScreensStore(): ShallowRef<ScreensState> {
  const state = shallowRef<ScreensState>(screensStore.getState());
  const unsubscribe = screensStore.subscribe((next) => {
    state.value = next;
  });
  // 组件卸载（或 effect scope 结束）时退订，避免跨页面残留监听。
  onScopeDispose(unsubscribe);
  return state;
}

export function useScreenSessionStore(): ShallowRef<ScreenSessionState> {
  const state = shallowRef<ScreenSessionState>(screenSessionStore.getState());
  const unsubscribe = screenSessionStore.subscribe((next) => {
    state.value = next;
  });
  onScopeDispose(unsubscribe);
  return state;
}
