import { Gas } from './gas';
import { DivePlan } from './planner';

export type ItineraryKind =
  | 'start'        // t=0, begin descent
  | 'arriveBottom' // reached max depth
  | 'leaveBottom'  // begin ascent
  | 'switch'       // gas / cylinder change
  | 'stop'         // deco stop (duration, until)
  | 'surface';

export interface ItineraryEvent {
  kind: ItineraryKind;
  /** runtime at which the event happens, minutes */
  runtime: number;
  /** depth in metres */
  depth: number;
  /** gas being breathed from this point */
  gas: Gas;
  /** stop length, minutes (stop only) */
  duration?: number;
  /** runtime when the stop ends (stop only) */
  until?: number;
  /** previous gas (switch only) */
  fromGas?: Gas;
}

/** Chronological "what to do when" list derived from the plan segments. */
export function itinerary(plan: DivePlan): ItineraryEvent[] {
  const ev: ItineraryEvent[] = [];
  const segs = plan.segments;
  if (segs.length === 0) return ev;

  ev.push({ kind: 'start', runtime: 0, depth: 0, gas: segs[0].gas });

  let leftBottom = false;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const startRt = s.runtime - s.duration;
    if (s.kind === 'descent') {
      ev.push({ kind: 'arriveBottom', runtime: s.runtime, depth: s.endDepth, gas: s.gas });
    } else if (s.kind === 'ascent' && !leftBottom) {
      leftBottom = true;
      ev.push({ kind: 'leaveBottom', runtime: startRt, depth: s.startDepth, gas: s.gas });
    } else if (s.kind === 'switch') {
      const prev = segs[i - 1];
      ev.push({ kind: 'switch', runtime: s.runtime, depth: s.startDepth, gas: s.gas, fromGas: prev?.gas });
    } else if (s.kind === 'stop') {
      ev.push({ kind: 'stop', runtime: startRt, depth: s.startDepth, gas: s.gas, duration: s.duration, until: s.runtime });
    }
  }
  const last = segs[segs.length - 1];
  ev.push({ kind: 'surface', runtime: last.runtime, depth: 0, gas: last.gas });
  return ev;
}
