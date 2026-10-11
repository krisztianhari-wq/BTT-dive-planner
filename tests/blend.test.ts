import { describe, expect, it } from 'vitest';
import { planBlend } from '../src/engine';

const AIR = { o2: 0.21, he: 0 };
const EAN32 = { o2: 0.32, he: 0 };
const EMPTY = { o2: 0.21, he: 0 };

describe('partial-pressure blending (textbook examples, ideal gas)', () => {
  it('EAN32 to 200 bar from empty, air top: O2 = (64 − 42) / 0.79 = 27.85 bar, air 172.15 bar', () => {
    const r = planBlend({ target: EAN32, targetBar: 200, start: EMPTY, startBar: 0, top: AIR });
    expect(r.feasible).toBe(true);
    expect(r.heBar).toBeCloseTo(0, 9);
    expect(r.o2Bar).toBeCloseTo(22 / 0.79, 6);
    expect(r.topBar).toBeCloseTo(200 - 22 / 0.79, 6);
    expect(r.result.o2).toBeCloseTo(0.32, 9);
    expect(r.mod14).toBeCloseTo(33.6, 0);
  });
  it('trimix 21/35 to 200 bar from empty, air top: He 70, O2 (42 − 0.21·130) / 0.79 = 18.61, air 111.39 bar', () => {
    const r = planBlend({ target: { o2: 0.21, he: 0.35 }, targetBar: 200, start: EMPTY, startBar: 0, top: AIR });
    expect(r.heBar).toBeCloseTo(70, 9);
    expect(r.o2Bar).toBeCloseTo(18.6076, 3);
    expect(r.topBar).toBeCloseTo(111.3924, 3);
    expect(r.afterHeBar).toBeCloseTo(70, 9);
    expect(r.afterO2Bar).toBeCloseTo(88.6076, 3);
    expect(r.result.he).toBeCloseTo(0.35, 9);
    expect(r.result.o2).toBeCloseTo(0.21, 9);
  });
  it('18/45 to 200 bar on top of 50 bar 18/45: He 67.5, O2 (36 − 9 − 0.21·82.5) / 0.79 = 12.247, air 70.253 bar', () => {
    const r = planBlend({ target: { o2: 0.18, he: 0.45 }, targetBar: 200, start: { o2: 0.18, he: 0.45 }, startBar: 50, top: AIR });
    expect(r.drainToBar).toBeNull();
    expect(r.heBar).toBeCloseTo(67.5, 9);
    expect(r.o2Bar).toBeCloseTo(9.675 / 0.79, 6);
    expect(r.topBar).toBeCloseTo(150 - 67.5 - 9.675 / 0.79, 6);
  });
  it('EAN32 from 150 bar EAN50 needs draining to 75.86 bar (22 / 0.29), then 124.14 bar air', () => {
    const r = planBlend({ target: EAN32, targetBar: 200, start: { o2: 0.5, he: 0 }, startBar: 150, top: AIR });
    expect(r.feasible).toBe(true);
    expect(r.drainToBar).toBeCloseTo(22 / 0.29, 6);
    expect(r.o2Bar).toBeCloseTo(0, 6);
    expect(r.topBar).toBeCloseTo(200 - 22 / 0.29, 6);
    expect(r.result.o2).toBeCloseTo(0.32, 9);
  });
  it('EAN32 top gas: 21/35 from empty: He 70, O2 (42 − 0.32·130)/0.68 = 0.588, EAN32 129.41 bar', () => {
    const r = planBlend({ target: { o2: 0.21, he: 0.35 }, targetBar: 200, start: EMPTY, startBar: 0, top: EAN32 });
    expect(r.o2Bar).toBeCloseTo((42 - 0.32 * 130) / 0.68, 6);
    expect(r.result.o2).toBeCloseTo(0.21, 9);
  });
  it('unreachable: EAN28 with an EAN32 top gas; bad input is rejected', () => {
    expect(planBlend({ target: { o2: 0.28, he: 0 }, targetBar: 200, start: EMPTY, startBar: 0, top: EAN32 }).feasible).toBe(false);
    expect(planBlend({ target: { o2: 0.5, he: 0.6 }, targetBar: 200, start: EMPTY, startBar: 0, top: AIR }).reason).toBe('badInput');
  });
});
