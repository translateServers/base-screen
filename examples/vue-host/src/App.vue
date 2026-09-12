<script setup lang="ts">
import type { BaseScreenDesignerElement } from '@base-screen/engine';
import type { BaseScreenPluginManager } from '@base-screen/plugin-manager';
import { onMounted, ref, shallowRef } from 'vue';
import HostToolbar from './components/HostToolbar.vue';
import { HOST_BUMP_COMMAND_ID } from './screen/host-plugin';

const props = defineProps<{
  designer: BaseScreenDesignerElement;
  manager: BaseScreenPluginManager;
}>();

const status = ref('就绪');
const busy = ref(false);

// 设计器是宿主创建的 DOM 节点、不是 Vue 组件，所以挂在 `.host-stage` 占位容器里。
// 用 shallowRef 避免 Vue 去代理整个设计器实例（它有大量内部状态，代理会带来开销与意外行为）。
const stage = shallowRef<HTMLElement | null>(null);
onMounted(() => {
  stage.value?.appendChild(props.designer);
});

const run = async (label: string, action: () => Promise<boolean> | boolean): Promise<void> => {
  if (busy.value) return;
  busy.value = true;
  status.value = `${label}…`;
  try {
    status.value = (await action()) ? `${label}完成` : `${label}失败`;
  } finally {
    busy.value = false;
  }
};

// 两条都是宿主可依赖的公共入口：插件命令经 manager 的贡献命令通道，
// 撤销经设计器自身的 history。宿主不碰设计器内部 Store。
const restock = () =>
  run('补货', async () => {
    const result = await props.manager.executeContributionCommand({
      commandId: HOST_BUMP_COMMAND_ID,
      args: null,
    });
    return result.ok;
  });

const undo = () => run('撤销', () => props.designer.undo().ok);
</script>

<template>
  <div class="host-shell">
    <HostToolbar :status="status" :busy="busy" @restock="restock" @undo="undo" />
    <div ref="stage" class="host-stage" />
  </div>
</template>
