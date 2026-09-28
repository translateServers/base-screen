<script setup lang="ts">
/** 统一错误横幅：message + 重试；几何稳定（固定内边距），不引入布局抖动。 */
defineProps<{
  message: string;
}>();
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="error-banner" role="alert">
    <span class="error-banner__message">{{ message }}</span>
    <button type="button" class="button" @click="emit('retry')">重试</button>
  </div>
</template>
