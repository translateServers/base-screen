import {
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  type BaseScreenDesignerElement,
} from '@base-screen/sdk/designer';
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createLogger } from '../lib/logger';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { registerHostMaterials, TOOL_MATERIAL_TYPES } from '../screen/register';
import { useScreenSessionStore } from '../store/screen-session-store';
import { showToast } from './toast';

const logger = createLogger('screen-editor');

const AUTOSAVE_DEBOUNCE_MS = 1200;
const AUTOSAVE_RETRY_MS = 5000;
const AUTOSAVE_RETRY_MAX_MS = 60000;

/**
 * 设计器嵌入页：设计器是 DOM 节点而非 React 组件——用 ref 拿容器后 appendChild，
 * 并在 effect 内完成 configure / load。顺序不可颠倒：画布与渲染器在元素 connected
 * 时才建立。这一页不叠宿主布局：占满视口，返回入口与保存状态都由基座顶栏提供。
 *
 * 会话状态（加载 / 脏 / 保存 / 冲突）仍走 zustand 状态机；宿主不再渲染状态文案，
 * 只在 error 变化的那一次把它转成 toast。
 *
 * 保存策略与另外两个前端逐条对等：脏后 1.2s 防抖保存；保存在飞行期间再次变脏则落定后
 * 补一次；失败按 5s 起指数退避自动重试；冲突即停止自动保存；返回按钮先落地再路由。
 */
export function ScreenEditorPage(): React.ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (screenId === undefined || stage === null) return;
    const session = useScreenSessionStore.getState();
    session.begin(screenId);

    const unsubscribeSession = useScreenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    const catalog = registerHostMaterials();
    // 尺寸交给 .stage / .stage > * 的 CSS（占满视口），宿主不再内联写百分比宽高。
    const designer = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
    stage.append(designer);

    // 宿主数据通道必须在 configure 内提交：renderer 在 configure 时建立，
    // 之后再赋 `resourcePort` 会被按「初始化后不可更换端口」拒绝。
    const configured = designer.configure({
      catalog,
      projectAdapter: createRestProjectAdapter(screenId),
      toolMaterialTypes: TOOL_MATERIAL_TYPES,
      resourcePort: createHostResourcePort(),
      // 组合的编辑期形态：多个原子物料成组后整体移动/缩放/旋转。缺了这行，顶栏「编辑 → 成组」
      // 与图层面板的成组按钮都不可用。
      groupMaterialType: 'base.container',
      // 返回按钮由基座顶栏渲染，宿主只负责点击后跳回自己的路由。
      backButton: true,
    });
    if (!configured.ok) {
      logger.error('designer configure failed', configured.diagnostics);
      session.failedToLoad('设计器配置失败，请查看控制台日志。');
      designer.remove();
      unsubscribeSession();
      return;
    }

    let saveTimer: number | undefined;
    // 飞行中的那一次保存：定时器与「返回前 flush」共用同一份，避免并发 PUT。
    let saveFlight: Promise<boolean> | undefined;
    let retryDelayMs = AUTOSAVE_RETRY_MS;
    // 引擎只在脏态翻转时发事件，之后连续编辑不再通知，因此宿主自己记脏位。
    let dirty = false;
    let conflicted = false;
    let leaving = false;

    const clearSaveTimer = (): void => {
      window.clearTimeout(saveTimer);
    };

    const scheduleSave = (delay: number): void => {
      if (leaving || conflicted) return;
      clearSaveTimer();
      saveTimer = window.setTimeout(() => {
        if (dirty) void runSave();
      }, delay);
    };

    const runSave = (): Promise<boolean> => {
      if (saveFlight !== undefined) return saveFlight;
      const flight = persist().finally(() => {
        if (saveFlight === flight) saveFlight = undefined;
      });
      saveFlight = flight;
      return flight;
    };

    /** 把当前文档 PUT 到宿主；返回是否已无未保存改动。 */
    const persist = async (): Promise<boolean> => {
      if (conflicted || !dirty) return true;
      // 脏位只由引擎事件清除：飞行期间的再次编辑不会发事件（引擎侧脏态没翻转），
      // 保存成功时引擎发现文档与快照不一致就保持 dirty，正好由下面的补排接住。
      useScreenSessionStore.getState().saving();
      const result = await designer.save();
      if (result.ok) {
        useScreenSessionStore.getState().saved(result.value.revision);
        retryDelayMs = AUTOSAVE_RETRY_MS;
        if (dirty) scheduleSave(AUTOSAVE_DEBOUNCE_MS);
        return !dirty;
      }
      if (conflicted) return false;
      logger.warn('autosave failed', result.diagnostics);
      useScreenSessionStore.getState().failed(`${Math.round(retryDelayMs / 1000)} 秒后自动重试`);
      scheduleSave(retryDelayMs);
      // 退避在排期之后推进：文案与实际延时必须是同一个数。
      retryDelayMs = Math.min(retryDelayMs * 2, AUTOSAVE_RETRY_MAX_MS);
      return false;
    };

    const onBack = (): void => {
      leaving = true;
      clearSaveTimer();
      void (async () => {
        // 移除元素会取消在飞行的项目请求，因此必须先落地再路由。
        await runSave();
        if (dirty && !conflicted) await runSave();
        navigate('/');
      })();
    };
    designer.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);

    // 冲突意味着 revision 已过期，自动重试只会再冲突一次；停掉自动保存，由用户重载。
    const onConflict = (): void => {
      conflicted = true;
      clearSaveTimer();
      useScreenSessionStore.getState().conflicted();
    };
    designer.addEventListener('base-screen-project-conflict', onConflict);

    const onDirtyChange = (event: Event): void => {
      const detail = (event as CustomEvent<{ dirty: boolean }>).detail;
      dirty = detail.dirty;
      if (!detail.dirty) {
        // 撤销回基线也会走到这里：未触发的退避延时要归零，否则下次失败从上一次的高度起跳。
        retryDelayMs = AUTOSAVE_RETRY_MS;
        return;
      }
      useScreenSessionStore.getState().dirty();
      scheduleSave(AUTOSAVE_DEBOUNCE_MS);
    };
    designer.addEventListener('base-screen-dirty-change', onDirtyChange);

    void (async () => {
      const loaded = await designer.load(screenId);
      if (!loaded.ok) {
        logger.error('designer load failed', loaded.diagnostics);
        useScreenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
        return;
      }
      useScreenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);
    })();

    return () => {
      designer.removeEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);
      designer.removeEventListener('base-screen-project-conflict', onConflict);
      designer.removeEventListener('base-screen-dirty-change', onDirtyChange);
      unsubscribeSession();
      clearSaveTimer();
      designer.remove();
      useScreenSessionStore.getState().reset();
      logger.debug('edit view released');
    };
  }, [screenId, navigate]);

  return <div className="stage" ref={stageRef} />;
}
