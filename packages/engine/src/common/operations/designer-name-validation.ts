// 「受长度约束的名称」的唯一校验规则。
//
// 宿主资源名、片段条目名与组件名原本各有一份结构相同的实现，只有长度上限的常量不同。
// 分散三处意味着补一条规则（首尾空白、Unicode 规范化）要改三个文件，漏一个就是不一致。

export function isBoundedName(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    /\S/.test(value) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    [...value].length <= limit
  );
}
