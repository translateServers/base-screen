import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { parseScreenDocument } from '@base-screen/contracts';
import { HOST_PRODUCT_CARD_TYPE } from './product-card';

export const HOST_PROJECT_ID = 'vue-host-demo';

/**
 * 宿主自己的演示文档：JSON-safe 的 canonical document，不含函数或框架对象。
 * 宿主存的就是这份 JSON，Base Screen 只在实例内编辑与渲染它。
 */
export function createHostDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#0f172a' },
    components: [
      {
        id: 'doc-title',
        type: 'base.text',
        name: '标题',
        parentId: null,
        position: { x: 80, y: 40 },
        size: { width: 420, height: 40 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        // fontWeight 是枚举（'400' | '700'）而不是数字，必须与物料 styleSchema 一致。
        style: { color: '#e8eefb', fontSize: 24, fontWeight: '700', textAlign: 'left' },
        dataSource: { type: 'static', value: '库存看板' },
      },
      {
        id: 'stock-card',
        type: HOST_PRODUCT_CARD_TYPE,
        name: '库存卡',
        parentId: null,
        position: { x: 80, y: 120 },
        size: { width: 260, height: 120 },
        rotation: 0,
        zIndex: 2,
        status: { locked: false, hidden: false },
        props: { title: '仓库 A', stock: 0 },
        style: {},
        dataSource: { type: 'static', value: null },
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

/**
 * 宿主侧的项目适配器：Base Screen 只发出有界请求，真正的存取、版本与发布归宿主。
 * 这里用内存实现演示边界——`revision` 由宿主维护，`publish` 明确不支持。
 */
export function createHostProjectAdapter(): ScreenProjectAdapter {
  let revision = 1;
  let document = createHostDocument();

  const envelope = (): ScreenProjectEnvelope => ({
    projectId: HOST_PROJECT_ID,
    revision: String(revision),
    name: 'Vue Host Demo',
    description: null,
    document,
    metadata: {},
  });

  return {
    capabilities: { publish: false },
    async load({ projectId }) {
      if (projectId !== HOST_PROJECT_ID) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'PROJECT_UNAVAILABLE',
              path: ['projectId'],
              message: `Unknown project: ${projectId}`,
            },
          ],
        };
      }
      return { ok: true, value: envelope(), diagnostics: [] };
    },
    async save({
      document: next,
      revision: expectedRevision,
    }): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
      // 宿主负责并发控制：revision 不匹配即拒绝，Base Screen 不做乐观锁。
      if (expectedRevision !== String(revision)) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'PROJECT_CONFLICT',
              path: ['revision'],
              message: 'The project changed since it was loaded.',
            },
          ],
        };
      }
      const parsed = parseScreenDocument(next);
      if (!parsed.ok) return parsed;
      document = parsed.value;
      revision += 1;
      return { ok: true, value: envelope(), diagnostics: [] };
    },
  };
}
