use dive_deco::{BuhlmannConfig, BuhlmannModel, DecoModel, DecoStageType, Depth, Gas, Time};

struct Profile { id: &'static str, depth: f64, bottom_time: f64, bottom: (f64, f64), deco: Vec<(f64, f64)> }

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let gf_low: u8 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(20);
    let gf_high: u8 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(85);
    let ascent_rate: f64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(9.0);
    let json = args.get(4).map(|s| s == "json").unwrap_or(false);
    let descent_rate = 20.0;

    let profiles = vec![
        Profile { id: "A", depth: 30., bottom_time: 30., bottom: (0.32, 0.), deco: vec![] },
        Profile { id: "B", depth: 45., bottom_time: 25., bottom: (0.21, 0.35), deco: vec![(0.5, 0.)] },
        Profile { id: "C", depth: 51., bottom_time: 30., bottom: (0.21, 0.35), deco: vec![(0.5, 0.)] },
        Profile { id: "D", depth: 60., bottom_time: 25., bottom: (0.18, 0.45), deco: vec![(0.5, 0.), (1.0, 0.)] },
        Profile { id: "E", depth: 75., bottom_time: 20., bottom: (0.15, 0.55), deco: vec![(0.35, 0.25), (0.5, 0.), (1.0, 0.)] },
        Profile { id: "E2", depth: 75., bottom_time: 20., bottom: (0.15, 0.55), deco: vec![(0.5, 0.), (1.0, 0.)] },
    ];

    if !json { println!("dive-deco oracle  GF {}/{}  descent {} m/min  ascent {} m/min", gf_low, gf_high, descent_rate, ascent_rate); }
    for p in profiles {
        let config = BuhlmannConfig::new()
            .with_gradient_factors(gf_low, gf_high)
            .with_surface_pressure(1013)
            .with_deco_ascent_rate(ascent_rate);
        let mut model = BuhlmannModel::new(config);
        let bottom_gas = Gas::new(p.bottom.0, p.bottom.1);
        let mut mixes = vec![bottom_gas];
        for d in &p.deco { mixes.push(Gas::new(d.0, d.1)); }

        model.record_travel_with_rate(Depth::from_meters(p.depth), descent_rate, &bottom_gas);
        let descent_min = p.depth / descent_rate;
        model.record(Depth::from_meters(p.depth), Time::from_minutes(p.bottom_time - descent_min), &bottom_gas);

        let runtime = model.deco(mixes).expect("deco");
        let mut stops: Vec<(f64, f64, String)> = vec![];
        let mut switches: Vec<(f64, String)> = vec![];
        for s in &runtime.deco_stages {
            match s.stage_type {
                DecoStageType::DecoStop => stops.push((s.start_depth.as_meters(), s.duration.as_minutes(), gas_name(&s.gas))),
                DecoStageType::GasSwitch => switches.push((s.start_depth.as_meters(), gas_name(&s.gas))),
                _ => {}
            }
        }
        if json {
            let st: Vec<String> = stops.iter().map(|s| format!("{{\"depth\":{:.0},\"minutes\":{:.2}}}", s.0, s.1)).collect();
            let dg: Vec<String> = p.deco.iter().map(|d| format!("{{\"o2\":{},\"he\":{}}}", d.0, d.1)).collect();
            println!("{{\"id\":\"{}\",\"maxDepth\":{},\"bottomTime\":{},\"bottomGas\":{{\"o2\":{},\"he\":{}}},\"decoGases\":[{}],\"gfLow\":{},\"gfHigh\":{},\"ascentRate\":{},\"stops\":[{}],\"tts\":{:.2},\"runtime\":{:.2}}}",
                p.id, p.depth, p.bottom_time, p.bottom.0, p.bottom.1, dg.join(","), gf_low, gf_high, ascent_rate, st.join(","), runtime.tts.as_minutes(), p.bottom_time + runtime.tts.as_minutes());
            continue;
        }
        let stop_total: f64 = stops.iter().map(|s| s.1).sum();
        let first = stops.first().map(|s| format!("{:.0}", s.0)).unwrap_or("-".into());
        println!("{} | {} m / {} min | first stop {} | stops {:.1} min | TTS {:.1} | runtime {:.1}",
            p.id, p.depth, p.bottom_time, first, stop_total, runtime.tts.as_minutes(), p.bottom_time + runtime.tts.as_minutes());
        let stop_str: Vec<String> = stops.iter().map(|s| format!("{:.0}m:{:.1}′({})", s.0, s.1, s.2)).collect();
        println!("    {}", stop_str.join("  "));
        let sw: Vec<String> = switches.iter().map(|s| format!("{}@{:.1}m", s.1, s.0)).collect();
        println!("    switches: {}", sw.join(", "));
    }
}

fn gas_name(g: &Gas) -> String {
    let pp = g.gas_pressures_compound(1.);
    let o2 = (pp.o2 * 100.).round() as i32;
    let he = (pp.he * 100.).round() as i32;
    if he == 0 { if o2 == 100 { "O2".into() } else if o2 == 21 { "Air".into() } else { format!("EAN{}", o2) } } else { format!("{}/{}", o2, he) }
}
