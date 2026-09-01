import { describe, expect, it } from 'vitest';
import type { BaseScreenMaterialLoadingOptions } from '../src/loading.js';
import {
  type BaseScreenMaterialLoadingState,
  createBaseScreenMaterialLoadingContainer,
} from '../src/loading-container.js';
import { documentFixture, LoadingTestNode } from './__fixtures__/loading-dom.js';

function fixture(options: BaseScreenMaterialLoadingOptions = {}) {
  const dom = documentFixture();
  const view = createBaseScreenMaterialLoadingContainer(dom.document, options);
  const element = view.element as unknown as LoadingTestNode;
  const content = dom.nodes.find((node) => node.attributes.part === 'content')!;
  const indicator = dom.nodes.find((node) => node.attributes.part === 'loading')!;
  return { ...dom, view, element, content, indicator };
}

describe('opt-in material loading container', () => {
  it('retains caller-owned content and observes loading without owning the data', () => {
    const { view, element, content, indicator, nodes } = fixture();
    const input = new LoadingTestNode('input');
    input.textContent = 'unfinished draft';
    element.append(input);
    const initialNodes = [...nodes];
    const state = Object.freeze({ status: 'loading' as const });

    view.update(state);
    view.update(state);
    expect(element.attributes['aria-busy']).toBe('true');
    expect(content.inert).toBe(true);
    expect(content.attributes['aria-hidden']).toBe('true');
    expect(indicator.hidden).toBe(false);
    expect(element.children).toEqual([input]);
    expect(input.parentNode).toBe(element);

    view.update(Object.freeze({ status: 'ready' as const, value: { unused: true } }));
    expect(element.attributes['aria-busy']).toBe('false');
    expect(content.inert).toBe(false);
    expect(content.attributes['aria-hidden']).toBe('false');
    expect(indicator.hidden).toBe(true);
    expect(element.children).toEqual([input]);
    expect(input.textContent).toBe('unfinished draft');
    expect(nodes).toEqual(initialNodes);
  });

  it.each(['idle', 'ready', 'error', 'empty'] as const)(
    'reveals caller content for %s without rendering another status message',
    (status) => {
      const { view, element, content, indicator } = fixture();
      const child = new LoadingTestNode('section');
      element.append(child);
      view.update({ status: 'loading' });
      view.update({ status });
      expect(content.inert).toBe(false);
      expect(indicator.hidden).toBe(true);
      expect(element.children).toEqual([child]);
    },
  );

  it('rejects unsupported presentation states before changing the visible state', () => {
    const { view, element, content, indicator } = fixture();
    view.update({ status: 'loading' });
    expect(() =>
      view.update({ status: 'busy' } as unknown as BaseScreenMaterialLoadingState),
    ).toThrow('Unsupported material presentation status.');
    expect(element.attributes['aria-busy']).toBe('true');
    expect(content.inert).toBe(true);
    expect(indicator.hidden).toBe(false);
  });

  it('updates labels as plain text without replacing content and restores the creation default', () => {
    const { view, element, nodes, indicator } = fixture({ label: 'Initial loading' });
    const label = nodes.find((node) => node.attributes.part === 'label')!;
    const input = new LoadingTestNode('input');
    element.append(input);
    const initialNodes = [...nodes];
    view.update({ status: 'loading' }, { label: 'Waiting to start' });
    expect(label.textContent).toBe('Waiting to start');
    view.update({ status: 'loading' }, { label: '<img src=x onerror=alert(1)>' });
    expect(label.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(label.children).toEqual([]);
    view.update({ status: 'ready' });
    expect(label.textContent).toBe('Initial loading');
    expect(indicator.hidden).toBe(true);
    expect(element.children).toEqual([input]);
    expect(nodes).toEqual(initialNodes);
  });

  it.each([null, 42, false, {}])('rejects a non-string label atomically: %j', (label) => {
    const { view, element, content, indicator, nodes } = fixture({ label: 'Unchanged' });
    view.update({ status: 'loading' });
    expect(() =>
      view.update({ status: 'ready' }, { label } as BaseScreenMaterialLoadingOptions),
    ).toThrow('Material loading label must be a string.');
    expect(element.attributes['aria-busy']).toBe('true');
    expect(content.inert).toBe(true);
    expect(indicator.hidden).toBe(false);
    expect(nodes.find((node) => node.attributes.part === 'label')!.textContent).toBe('Unchanged');
  });

  it('keeps each container independent and leaves caller content intact on disposal', () => {
    const first = fixture();
    const second = fixture();
    const parent = new LoadingTestNode('section');
    const child = new LoadingTestNode('input');
    first.element.append(child);
    parent.append(first.element, second.element);
    first.view.update({ status: 'loading' });
    expect(second.indicator.hidden).toBe(true);

    first.view.dispose();
    first.view.dispose();
    first.view.update({ status: 'loading' });
    expect(parent.children).toEqual([second.element]);
    expect(first.element.children).toEqual([child]);
    expect(first.content.inert).toBe(false);
    expect(first.indicator.hidden).toBe(true);
    expect(first.element.attributes['aria-busy']).toBe('false');
  });
});
