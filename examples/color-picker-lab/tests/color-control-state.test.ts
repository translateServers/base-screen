import { describe, expect, it } from 'vitest';
import { ColorControlState } from '../src/color-control-state.js';
import { rgbaToHex } from '../src/color-model.js';

describe('color form control state', () => {
  it('loads and serializes a canonical linear gradient', () => {
    const state = new ColorControlState();

    expect(state.load('linear-gradient(135deg, #ff0000 0%, #0000ff80 100%)')).toBe(true);
    expect(state.mode).toBe('linear-gradient');
    expect(state.value).toBe('linear-gradient(135deg, #ff0000 0%, #0000ff80 100%)');
  });

  it('loads and serializes radial shape and center', () => {
    const state = new ColorControlState();

    expect(state.load('radial-gradient(ellipse at 35% 65%, #ffffff 0%, #182331 100%)')).toBe(true);
    expect(state.mode).toBe('radial-gradient');
    expect(state.radialShape).toBe('ellipse');
    expect(state.radialCenterX).toBe(35);
    expect(state.radialCenterY).toBe(65);
    expect(state.value).toBe('radial-gradient(ellipse at 35% 65%, #ffffff 0%, #182331 100%)');
  });

  it('adds an interpolated stop and keeps two stops as the minimum', () => {
    const state = new ColorControlState();
    state.mode = 'linear-gradient';

    state.addStop(50);
    const added = state.gradientStops.find((stop) => stop.id === state.selectedStopId);
    expect(added?.position).toBe(50);
    expect(added === undefined ? undefined : rgbaToHex(added.color)).toBe('#2aafda');
    expect(state.removeSelectedStop()).toBe(true);
    expect(state.gradientStops).toHaveLength(2);
    expect(state.removeSelectedStop()).toBe(false);
  });

  it('shares one color between solid mode and the first gradient stop', () => {
    const state = new ColorControlState();

    expect(state.load('#ff765c80')).toBe(true);
    state.mode = 'linear-gradient';
    expect(state.value).toBe('linear-gradient(90deg, #ff765c80 0%, #30dab4 100%)');

    state.selectedStopId = 'stop-2';
    state.selectFirstStop();
    expect(state.selectedStopId).toBe('stop-1');
    state.setCurrentColor({ r: 124, g: 108, b: 255, a: 1 });
    state.mode = 'solid';
    expect(state.value).toBe('#7c6cff');
    state.mode = 'radial-gradient';
    expect(state.value).toBe('radial-gradient(circle at 50% 50%, #7c6cff 0%, #30dab4 100%)');

    state.moveStop('stop-1', 100);
    state.moveStop('stop-2', 0);
    state.mode = 'solid';
    expect(state.value).toBe('#30dab4');
  });

  it('rejects malformed or out-of-range gradient values', () => {
    const state = new ColorControlState();

    expect(state.load('linear-gradient(361deg, #fff 0%, #000 100%)')).toBe(false);
    expect(state.load('radial-gradient(circle at 101% 50%, #fff 0%, #000 100%)')).toBe(false);
    expect(state.load('linear-gradient(90deg, #fff 0%)')).toBe(false);
  });
});
