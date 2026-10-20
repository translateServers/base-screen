/**
 * 旧入口：取值求值与字段映射校验的实现已经迁到 `data/value-ref.ts`。
 *
 * 本文件只剩 re-export，保证 engine/renderer 在 T02c 之前仍能从 `@base-screen/core`
 * 拿到原来的名字；T02c 把宿主数据通道改成按实例请求后整文件删除。
 * 不允许在这里重新实现任何求值逻辑。
 */
export {
  evaluateScreenHostResourceParameters,
  extractScreenHostResourceVariableDependencies,
  type ScreenDataBindingRole,
  type ScreenDataBindingValidation,
  type ScreenDataBindingValidation as ScreenHostResourceBindingValidation,
  type ScreenHostResourceParameterEvaluation,
  validateScreenDataBinding,
  validateScreenDataBinding as validateScreenHostResourceBinding,
} from './value-ref.js';
