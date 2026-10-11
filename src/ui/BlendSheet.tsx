import { useMemo, useState } from 'react';
import { Gas, gasName, planBlend } from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { Card, KV, Label, Note, NumRow, Seg, Verdict } from './kit';

/** Partial-pressure blending calculator (nitrox / trimix), shown in a bottom sheet. */
export function BlendTool({ t, u, lang }: { t: Dict; u: Units; lang: 'hu' | 'en' }) {
  const [tO2, setTO2] = useState(21); const [tHe, setTHe] = useState(35); const [tBar, setTBar] = useState(200);
  const [sO2, setSO2] = useState(21); const [sHe, setSHe] = useState(0); const [sBar, setSBar] = useState(0);
  const [top, setTop] = useState<'air' | 'ean32'>('air');
  const fmt = (v: number, d = 1) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const topGas: Gas = top === 'air' ? { o2: 0.21, he: 0 } : { o2: 0.32, he: 0 };
  const r = useMemo(() => planBlend({ target: { o2: tO2 / 100, he: tHe / 100 }, targetBar: tBar, start: { o2: sO2 / 100, he: sHe / 100 }, startBar: sBar, top: topGas }),
    [tO2, tHe, tBar, sO2, sHe, sBar, top]);
  const pAbs = (bar: number) => (u.sys === 'metric' ? `${fmt(bar)} ${u.p}` : `${fmt(bar * 14.5038, 0)} ${u.p}`);
  return (
    <>
      <Label>{t.blendTarget}</Label>
      <Card className="list">
        <NumRow label="O2 %" min={5} max={100} value={tO2} onChange={(v) => { setTO2(v); if (v + tHe > 100) setTHe(100 - v); }} />
        <NumRow label="He %" min={0} max={95} value={tHe} onChange={(v) => setTHe(Math.min(v, 100 - tO2))} />
        <NumRow label={t.blendPressure(u)} min={0} max={u.pressureN(300)} value={u.pressureN(tBar)} onChange={(v) => setTBar(u.toBar(v))} />
      </Card>
      <Label>{t.blendStart}</Label>
      <Card className="list">
        <NumRow label="O2 %" min={5} max={100} value={sO2} onChange={(v) => { setSO2(v); if (v + sHe > 100) setSHe(100 - v); }} />
        <NumRow label="He %" min={0} max={95} value={sHe} onChange={(v) => setSHe(Math.min(v, 100 - sO2))} />
        <NumRow label={t.blendPressure(u)} min={0} max={u.pressureN(300)} value={u.pressureN(sBar)} onChange={(v) => setSBar(u.toBar(v))} />
        <div className="row stack">
          <span className="row-l">{t.blendTop}</span>
          <Seg value={top} onChange={setTop} options={[{ v: 'air' as const, l: t.blendAir }, { v: 'ean32' as const, l: 'EAN32' }]} />
        </div>
      </Card>
      {!r.feasible ? (
        <Verdict tone="bad" title={r.reason === 'badInput' ? t.blendBadInput : t.blendUnreachable} />
      ) : (
        <>
          <Label>{t.blendSteps}</Label>
          <Card className="list">
            {r.drainToBar !== null && <KV l={t.blendDrain} v={pAbs(r.drainToBar)} tone="bad" />}
            <KV l={t.blendAddHe} sub={`→ ${pAbs(r.afterHeBar)}`} v={`+${pAbs(r.heBar)}`} />
            <KV l={t.blendAddO2} sub={`→ ${pAbs(r.afterO2Bar)}`} v={`+${pAbs(r.o2Bar)}`} />
            <KV l={t.blendAddTop(top === 'air' ? t.blendAir : 'EAN32')} sub={`→ ${pAbs(tBar)}`} v={`+${pAbs(r.topBar)}`} />
            <KV l={t.blendResult} v={`${gasName({ o2: r.result.o2, he: r.result.he })} · ${fmt(r.result.o2 * 100)}/${fmt(r.result.he * 100)}`} tone="ok" />
            <KV l={t.blendMod} v={`${u.depth(r.mod14)} / ${u.depth(r.mod16)}`} />
          </Card>
        </>
      )}
      <Note>{t.blendNote}</Note>
    </>
  );
}
