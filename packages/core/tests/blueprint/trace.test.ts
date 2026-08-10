import { describe, expect, it } from 'vitest';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintTraceResult,
  traceScreenBlueprintEvent,
} from '../../src/blueprint/runtime.js';
import { makeComponent, makeDocument, makeVariable } from '../__fixtures__/document.js';

function planDocument() {
  return makeDocument({
    components: [makeComponent({ id: 'button' })],
    variables: [makeVariable({ name: 'count', value: 0 })],
    blueprint: {
      rules: [
        {
          id: 'other',
          trigger: { type: 'material-event', componentId: 'other', eventName: 'click' },
          actions: [
            {
              type: 'emit-host-event',
              eventName: 'wrong',
              payload: { kind: 'literal', value: 1 },
            },
          ],
        },
        {
          id: 'guard',
          trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
          condition: {
            left: { kind: 'event-payload', path: ['value'] },
            operator: 'gte',
            right: { kind: 'literal', value: 10 },
          },
          actions: [
            {
              type: 'set-variable',
              variableName: 'count',
              value: { kind: 'literal', value: 1 },
            },
          ],
        },
        {
          id: 'react',
          trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
          actions: [
            {
              type: 'set-variable',
              variableName: 'count',
              value: { kind: 'event-payload', path: ['value'] },
            },
            {
              type: 'emit-host-event',
              eventName: 'refresh',
              payload: { kind: 'literal', value: { source: 'button' } },
            },
            {
              type: 'host-action',
              actionId: 'action.notify',
              payload: { kind: 'literal', value: null },
            },
          ],
        },
      ],
    },
  });
}

describe('EB-R7-C01 Core trace equivalence', () => {
  it('trace and dispatch produce field-equivalent outputs for a successful run', () => {
    const compiled = compileScreenBlueprint(planDocument());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const plan = compiled.value;
    const event = { componentId: 'button', name: 'click', payload: { value: 7 } };

    const dispatch = dispatchScreenBlueprintEvent(plan, plan.initialVariables, event);
    const trace = traceScreenBlueprintEvent(plan, plan.initialVariables, event);
    expect(dispatch.ok).toBe(true);
    expect(trace.ok).toBe(true);
    if (!dispatch.ok || !trace.ok) return;

    const traced = trace.value as ScreenBlueprintTraceResult;
    expect(traced.variables).toEqual(dispatch.value.variables);
    expect(traced.hostEvents).toEqual(dispatch.value.hostEvents);
    expect(traced.hostActions).toEqual(dispatch.value.hostActions);

    expect(traced.ruleTraces).toHaveLength(3);
    const [other, guard, react] = traced.ruleTraces;
    expect(other).toEqual({
      ruleId: 'other',
      triggerMatched: false,
      condition: 'not-evaluated',
      actions: [],
    });
    expect(guard?.condition).toBe('failed');
    expect(guard?.actions).toEqual([]);
    expect(react?.condition).toBe('none');
    expect(react?.actions).toHaveLength(3);
    expect(react?.actions[0]).toMatchObject({
      type: 'set-variable',
      actionIndex: 0,
      variableName: 'count',
      output: 7,
    });
    expect(react?.actions[1]).toMatchObject({
      type: 'emit-host-event',
      actionIndex: 1,
      eventName: 'refresh',
    });
    expect(react?.actions[2]).toMatchObject({
      type: 'host-action',
      actionIndex: 2,
      actionId: 'action.notify',
    });
  });

  it('records passed conditions with per-rule ordering and detached snapshots', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' })],
      blueprint: {
        rules: [
          {
            id: 'ok',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            condition: {
              left: { kind: 'event-payload', path: ['value'] },
              operator: 'gt',
              right: { kind: 'literal', value: 1 },
            },
            actions: [
              {
                type: 'emit-host-event',
                eventName: 'e',
                payload: { kind: 'literal', value: { x: 1 } },
              },
            ],
          },
        ],
      },
    });
    const compiled = compileScreenBlueprint(document);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const trace = traceScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId: 'button',
      name: 'click',
      payload: { value: 5 },
    });
    expect(trace.ok).toBe(true);
    if (!trace.ok) return;
    const traced = trace.value as ScreenBlueprintTraceResult;
    expect(traced.ruleTraces[0]?.condition).toBe('passed');
    expect(traced.ruleTraces[0]?.actions[0]?.detached).toEqual({
      type: 'emit-host-event',
      actionIndex: 0,
      eventName: 'e',
      output: { x: 1 },
    });
  });

  it('EB-R7-C01 locates rule and action errors identically for trace and dispatch', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' })],
      blueprint: {
        rules: [
          {
            id: 'bad',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'set-variable',
                variableName: 'count',
                value: { kind: 'variable', name: 'missing' },
              },
            ],
          },
        ],
      },
    });
    const compiled = compileScreenBlueprint(document);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const event = { componentId: 'button', name: 'click', payload: null };
    const dispatch = dispatchScreenBlueprintEvent(
      compiled.value,
      compiled.value.initialVariables,
      event,
    );
    const trace = traceScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, event);
    expect(dispatch.ok).toBe(false);
    expect(trace.ok).toBe(false);
    if (dispatch.ok || trace.ok) return;
    expect(trace.diagnostics[0]?.code).toBe(dispatch.diagnostics[0]?.code);
    expect(trace.diagnostics[0]?.path).toEqual(dispatch.diagnostics[0]?.path);
    expect(trace.diagnostics[0]?.path).toEqual([0, 0]);
  });

  it('EB-R7-C02 keeps trace output detached from plan and state', () => {
    const compiled = compileScreenBlueprint(planDocument());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const plan = compiled.value;
    const initialState = plan.initialVariables;
    const trace = traceScreenBlueprintEvent(plan, initialState, {
      componentId: 'button',
      name: 'click',
      payload: { value: 3 },
    });
    expect(trace.ok).toBe(true);
    if (!trace.ok) return;
    const traced = trace.value as ScreenBlueprintTraceResult;
    (traced.variables as Record<string, unknown>).count = 'mutated';
    (traced.ruleTraces[2]?.actions[0] as { output: unknown }).output = 'mutated';
    expect(plan.initialVariables).toEqual(initialState);
    expect(JSON.stringify(initialState)).not.toContain('mutated');
    const replayed = traceScreenBlueprintEvent(plan, initialState, {
      componentId: 'button',
      name: 'click',
      payload: { value: 3 },
    });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    const replayedTraced = replayed.value as ScreenBlueprintTraceResult;
    expect(replayedTraced.variables.count).toBe(3);
    expect(replayedTraced.ruleTraces[2]?.actions[0]?.output).toBe(3);
  });

  it('EB-R7-C02 rejects payload beyond the event budget without host calls', () => {
    const compiled = compileScreenBlueprint(planDocument());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const trace = traceScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId: 'button',
      name: 'click',
      payload: { value: 'x'.repeat(300 * 1024) },
    });
    expect(trace.ok).toBe(false);
  });
});
