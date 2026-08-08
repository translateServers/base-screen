import { mergeConfig } from 'vite';
import browserHarnessConfig from '../browser-harness/vite.config.ts';

export default mergeConfig(browserHarnessConfig, {
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
});
