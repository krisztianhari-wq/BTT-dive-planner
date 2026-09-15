import { DivePlan } from '../engine';

export function ProfileChart({ plan, unitLabel = 'min', depthLabel = 'm', depthScale = 1 }: { plan: DivePlan; unitLabel?: string; depthLabel?: string; depthScale?: number }) {
  const W = 800, H = 260, padL = 40, padR = 12, padT = 12, padB = 26;
  const maxT = Math.max(1, plan.runtime);
  const maxD = Math.max(3, plan.maxDepth) * 1.1 * depthScale; // display units
  const x = (t: number) => padL + (t / maxT) * (W - padL - padR);
  const y = (d: number) => padT + ((d * depthScale) / maxD) * (H - padT - padB);
  const yD = (dDisplay: number) => padT + (dDisplay / maxD) * (H - padT - padB);

  const pts: string[] = [`${x(0)},${y(0)}`];
  let t = 0;
  for (const s of plan.segments) { t += s.duration; pts.push(`${x(t)},${y(s.endDepth)}`); }
  const switches = plan.segments.filter((s) => s.kind === 'switch');

  return (
    <svg className="profile" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {niceTicks(maxD, 5).map((d) => (
        <g key={`d${d}`}>
          <line className="gridline" x1={padL} x2={W - padR} y1={yD(d)} y2={yD(d)} />
          <text className="tick" x={padL - 6} y={yD(d) + 4} fontSize="11" textAnchor="end">{d}</text>
        </g>
      ))}
      {niceTicks(maxT, 6).map((tt) => (
        <text className="tick" key={`t${tt}`} x={x(tt)} y={H - 8} fontSize="11" textAnchor="middle">{tt}</text>
      ))}
      <polyline className="line" points={pts.join(' ')} fill="none" strokeWidth={2} strokeLinejoin="round" />
      {switches.map((s, i) => (
        <g key={i}>
          <circle className="sw" cx={x(s.runtime)} cy={y(s.startDepth)} r={4} />
          <text className="sw" x={x(s.runtime) + 6} y={y(s.startDepth) - 6} fontSize="11">{s.gas.name ?? ''}</text>
        </g>
      ))}
      <text className="tick" x={W - padR} y={H - 8} fontSize="11" textAnchor="end">{unitLabel}</text>
      <text className="tick" x={padL - 6} y={padT + 2} fontSize="11" textAnchor="end">{depthLabel}</text>
    </svg>
  );
}

function niceTicks(max: number, count: number): number[] {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(Math.round(v));
  return out;
}
