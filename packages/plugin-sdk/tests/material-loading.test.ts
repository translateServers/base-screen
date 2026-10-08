import { describe, expect, it } from 'vitest';
import { createBaseScreenMaterialLoadingElement } from '../src/material-loading.js';
import { documentFixture } from './__fixtures__/loading-dom.js';

describe('shared material loading view', () => {
  it('uses only the supplied owner document and creates detached, independent views', () => {
    const first = documentFixture();
    const second = documentFixture();
    const one = createBaseScreenMaterialLoadingElement(first.document);
    const two = createBaseScreenMaterialLoadingElement(second.document);
    expect(one).not.toBe(two);
    expect(first.nodes[0]).toBe(one);
    expect(second.nodes[0]).toBe(two);
    expect(first.nodes.at(-1)?.textContent).toBe('加载中');
    expect(first.nodes[0]?.attributes).toMatchObject({
      role: 'status',
      'aria-live': 'polite',
      'aria-busy': 'true',
    });
  });

  it('renders custom labels as inert text with isolated styling and a decorative spinner', () => {
    const fixture = documentFixture();
    const label = '<img src=x onerror=alert(1)> Loading';
    createBaseScreenMaterialLoadingElement(fixture.document, { label });
    expect(fixture.nodes.map((node) => node.tagName)).toEqual(['div', 'style', 'span', 'span']);
    expect(fixture.nodes.at(-1)?.textContent).toBe(label);
    expect(fixture.nodes[2]?.attributes['aria-hidden']).toBe('true');
    expect(fixture.nodes[0]?.children).toEqual([]);
    expect(fixture.nodes[0]?.shadowRoot?.children).toEqual(fixture.nodes.slice(1));
  });

  it('rejects invalid labels before allocating a view', () => {
    const fixture = documentFixture();
    expect(() =>
      createBaseScreenMaterialLoadingElement(fixture.document, { label: 1 as never }),
    ).toThrow('Material loading label must be a string.');
    expect(fixture.nodes).toEqual([]);
  });
});
