/**
 * 结构化 JSON 相等：键序无关、数组逐元素、`Object.is` 处理原始值。
 *
 * 这是「两个 JSON 值是否相等」的唯一实现。参数取 `unknown` 是因为调用方常常在
 * 类型尚未收窄处比较（命令前后快照、条件表达式两侧），而不是因为接受非 JSON 值：
 * 遇到不可比较的值一律返回 false，不抛异常。
 *
 * 注意：本函数不适用于「运行时输入是否与其规范化结果逐属性一致」这类校验——
 * 那种场景要求只读自有数据属性（不触发 getter）、并包含不可枚举键，见
 * `@base-screen/plugin-manager` 预检中的自有数据属性相等。
 */
export function screenJsonEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => screenJsonEquals(value, right[index]));
  }
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && screenJsonEquals(leftObject[key], rightObject[key]),
  );
}
