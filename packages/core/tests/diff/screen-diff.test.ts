import { describe, expect, it } from 'vitest';
import { diffScreenDocuments } from '../../src/index.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

describe('diffScreenDocuments', () => {
  it('reports structural and binding fields that a proposal can change', () => {
    const before = makeDocument({
      components: [
        makeComponent({ id: 'group' }),
        makeComponent({ id: 'title', type: 'base.text' }),
      ],
    });
    const after = makeDocument({
      components: [
        makeComponent({ id: 'group' }),
        makeComponent({
          id: 'title',
          type: 'base.rectangle',
          parentId: 'group',
          status: { locked: true, hidden: false },
          dataBinding: { fields: { value: ['amount'] } },
        }),
      ],
    });

    const row = diffScreenDocuments(before, after).find((item) => item.componentId === 'title');
    // 这些字段以前不进 diff：改了也显示「无差异」，评审面看不出智能体动了结构或绑定。
    expect(row?.entries.map((entry) => entry.path)).toEqual([
      'type',
      'parentId',
      'status',
      'dataBinding',
    ]);
  });

  it('keeps an unchanged component out of the result', () => {
    const document = makeDocument({ components: [makeComponent({ id: 'title' })] });
    expect(diffScreenDocuments(document, document)).toEqual([]);
  });
});
