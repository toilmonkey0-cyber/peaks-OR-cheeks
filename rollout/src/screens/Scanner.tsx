import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, Snapshot, Team } from "@/data/schema";
import {
  ATOMIC_CHEEKS_LINES, CELEBRATION_MS, CHEEKS_LINES, GROUPS, PEAK_LINES,
  STREAK_LINES, TIER_ACCENT, VERDICT_BEAT_MS,
} from "@/engine/config";
import { filterPool, planScan, verdictOf, type ScanPlan, type Verdict } from "@/engine/draw";
import { tickTimes, rollupNotes } from "@/audio/schedule";
import { synth } from "@/audio/synth";
import { HAPTICS, chargeLevel, haptic, setHapticsEnabled, vibrationSupported } from "@/haptics/haptics";
import { recordPull, SOURCES, type SaveState, type Source } from "@/storage/storage";
import { sourceLabel } from "@/data/snapshot";
import { poolVerdictRates } from "@/engine/luck";
import { copyText } from "@/util/clipboard";
import { CardView } from "@/components/CardView";
import { LuckGauge } from "@/components/LuckGauge";
import { LuckStrip, ticksFromLog } from "@/components/LuckStrip";
import { Vault } from "@/components/Vault";
import "./Scanner.css";

type Phase = "idle" | "charging" | "scanning" | "result";
type SetSave = React.Dispatch<React.SetStateAction<SaveState>>;

const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);

function cardText(card: Card): string {
  const attrs = card.attributes.slice(0, 4).map((a) => `${a.label} ${a.value}`).join(" · ");
  const xf = card.xfactor ? " · X-FACTOR" : "";
  return `${card.rating} OVR · ${card.fullName} · ${card.position} · ${card.team}${xf}\n${attrs}`;
}

// Canvas helper: DPR-aware transform + CSS-pixel coordinate space.
function ctx2d(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const s = w ? canvas.width / w : 1;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  return { ctx, w, h };
}

export function Scanner({ save, setSave, snapshots }: {
  save: SaveState; setSave: SetSave; snapshots: Record<Source, Snapshot>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [locked, setLocked] = useState({ pos: false, team: false, name: false, ovr: false });
  const [result, setResult] = useState<Card | null>(null);
  const [nearFlash, setNearFlash] = useState<string | null>(null);
  const [ovrDisplay, setOvrDisplay] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chargeMs, setChargeMs] = useState(0);
  const [celebration, setCelebration] =
    useState<{ kind: Exclude<Verdict, null>; line: string; streakLine?: string } | null>(null);
  const celebrationToken = useRef(0);
  const [manualSheet, setManualSheet] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  // phones: the side column is a bottom sheet — auto-opens on a fresh result,
  // or manually via the scoreline (history viewer)
  const sheetOpen = (result !== null && phase === "result") || manualSheet;

  const planRef = useRef<ScanPlan | null>(null);
  const timers = useRef<number[]>([]);
  const rafs = useRef<number[]>([]);
  const focusRef = useRef<HTMLCanvasElement>(null);
  const tickerRef = useRef<HTMLCanvasElement>(null);
  const burstRef = useRef<HTMLCanvasElement>(null);
  const chargeTimer = useRef<number | null>(null);
  const reduceMotion = useMemo(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const switchSource = (s: Source) => {
    if (s === source) return;
    pulse(HAPTICS.ui);
    clearTimers();
    planRef.current = null;
    setResult(null);
    setNearFlash(null);
    setCelebration(null);
    celebrationToken.current++;
    setPhase("idle");
    setSave((prev) => ({ ...prev, source: s }));
  };

  const iOSShim = !vibrationSupported();
  const rootRef = useRef<HTMLDivElement>(null);
  // haptic + visual stand-in where the Vibration API doesn't exist (iPad)
  const pulse = useCallback((pattern: number[]) => {
    haptic(pattern);
    if (!iOSShim) return;
    const el = rootRef.current;
    if (!el) return;
    el.classList.add("vibe-shim");
    window.setTimeout(() => el.classList.remove("vibe-shim"), 130);
  }, [iOSShim]);

  const source = save.source;
  const snapshot = snapshots[source];
  const stats = save.stats[source];
  const teams: Record<string, Team> = useMemo(
    () => Object.fromEntries(snapshot.teams.map((t) => [t.abbr, t])), [snapshot]);
  const pool = useMemo(() => filterPool(snapshot.players, GROUPS[save.group] ?? null),
    [snapshot.players, save.group]);
  const verdictRates = useMemo(() => poolVerdictRates(pool), [pool]);
  const byId = useMemo(() => Object.fromEntries(snapshot.players.map((p) => [p.playerId, p])),
    [snapshot.players]);
  const best = stats.bestId ? byId[stats.bestId] : null;
  const ticks = useMemo(() => ticksFromLog(stats.pullLog, byId), [stats.pullLog, byId]);

  const shownTeam = result ?? (planRef.current?.card ?? null);

  useEffect(() => { setHapticsEnabled(save.hapticsOn); }, [save.hapticsOn]);
  useEffect(() => { synth.setEnabled(save.soundOn); }, [save.soundOn]);
  useEffect(() => { synth.setCrowd(save.crowdOn && save.soundOn); }, [save.crowdOn, save.soundOn]);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, reduceMotion ? Math.min(ms, 260) : ms);
    timers.current.push(id);
    return id;
  }, [reduceMotion]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    rafs.current.forEach(cancelAnimationFrame);
    rafs.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // ── canvas backing stores: match display size (DPR-aware) or text blurs ──
  useEffect(() => {
    const fit = (c: HTMLCanvasElement | null) => {
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
    };
    const canvases = [focusRef.current, tickerRef.current, burstRef.current];
    const run = () => canvases.forEach(fit);
    run();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(run) : null;
    canvases.forEach((c) => c && ro?.observe(c));
    window.addEventListener("resize", run);
    return () => { ro?.disconnect(); window.removeEventListener("resize", run); };
  }, []);

  // ── ambient ticker (always on, cheap) ──────────────────────────────────────
  useEffect(() => {
    const canvas = tickerRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();
    const names = snapshot.players;
    let x = 0;
    const row = (c2: { ctx: CanvasRenderingContext2D; w: number }, y: number, alpha: number) => {
      const gap = 190;
      const { ctx, w } = c2;
      const shift = Math.floor(x / gap);
      ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = `rgba(125,138,165,${alpha})`;
      for (let i = 0; i < w / gap + 2; i++) {
        const p = names[Math.abs((i + shift) * 31 + y * 977) % names.length];
        ctx.fillText(p.name.toUpperCase(), i * gap - (x % gap), y);
      }
    };
    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const c2 = ctx2d(canvas);
      if (c2) {
        const dim = phase === "scanning" ? 0.35 : 1;
        c2.ctx.clearRect(0, 0, c2.w, c2.h);
        x += dt * 0.045;
      row(c2, 22, 0.24 * dim);
      row(c2, c2.h - 10, 0.15 * dim);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [snapshot.players, phase]);

  // ── focus window render (idle grid + scanning reel) ──────────────────────
  useEffect(() => {
    const canvas = focusRef.current;
    if (!canvas) return;
    let raf = 0;
    const start = performance.now();

    const drawName = (c2: { ctx: CanvasRenderingContext2D; w: number; h: number },
      name: string, blur: number, color: string) => {
      const { ctx } = c2;
      const width = c2.w, height = c2.h;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fs = Math.min(44, width / Math.max(7, name.length + 2)) * 1.6;
      ctx.font = `900 ${fs}px ui-sans-serif, system-ui, sans-serif`;
      for (let g = 1; g <= 3; g++) {
        ctx.fillStyle = `rgba(232,237,247,${0.10 * blur})`;
        ctx.fillText(name, width / 2 + g * 18 * blur, height / 2);
        ctx.fillText(name, width / 2 - g * 18 * blur, height / 2);
      }
      ctx.fillStyle = color;
      ctx.fillText(name, width / 2, height / 2);
      if (blur > 0.15) {
        ctx.strokeStyle = `rgba(120,150,220,${0.25 * blur})`;
        for (let i = 0; i < 4; i++) {
          const y = Math.random() * height;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }
    };

    const frame = (now: number) => {
      const t = now - start;
      const plan = planRef.current;
      const c2 = ctx2d(canvas);
      if (c2) {
        const { ctx, w: width, h: height } = c2;
        ctx.clearRect(0, 0, width, height);
        if (phase !== "scanning" || !plan) {
          if (phase === "result" && planRef.current) {
            drawName(c2, planRef.current.card.name, 0, TIER_ACCENT[planRef.current.card.tier]);
          } else {
          // idle: faint grid + drifting scan bar
          ctx.strokeStyle = "rgba(46,60,95,0.35)";
          for (let gx = 0; gx < width; gx += 34) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, height); ctx.stroke();
          }
          for (let gy = 0; gy < height; gy += 34) {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke();
          }
          const sweep = (t * 0.06) % (width + 220) - 110;
          const grad = ctx.createLinearGradient(sweep - 90, 0, sweep + 90, 0);
          grad.addColorStop(0, "rgba(56,189,248,0)");
          grad.addColorStop(0.5, "rgba(56,189,248,0.10)");
          grad.addColorStop(1, "rgba(56,189,248,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(sweep - 90, 0, 180, height);
          }
        } else {
          const p = Math.min(1, t / plan.delays.name);
          if (!reduceMotion) {
            const idx = Math.floor(easeOutQuart(p) * (plan.reel.length - 1));
            const entry = plan.reel[Math.min(idx, plan.reel.length - 1)];
            drawName(c2, entry.name, 1 - easeOutQuart(p), "#e8edf7");
          } else if (p >= 1) {
            drawName(c2, plan.card.name, 0, "#e8edf7");
          }
          if (t < plan.delays.name) raf = requestAnimationFrame(frame);
        }
      } else {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, reduceMotion]);

  const burst = useCallback((colors: string[], mode: "burst" | "flutter" = "burst") => {
    if (reduceMotion) return;
    const canvas = burstRef.current;
    const c2 = canvas ? ctx2d(canvas) : null;
    if (!canvas || !c2) return;
    const { ctx, w, h } = c2;
    const parts = mode === "burst"
      ? Array.from({ length: 70 }, () => ({
          x: w / 2, y: h / 2,
          vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 8 - 2,
          c: colors[Math.floor(Math.random() * colors.length)],
          life: 1, sway: 0,
        }))
      : Array.from({ length: 46 }, () => ({
          x: Math.random() * w, y: -12,
          vx: (Math.random() - 0.5) * 1.1, vy: 0.35 + Math.random() * 0.9,
          c: colors[Math.floor(Math.random() * colors.length)],
          life: 1.6, sway: Math.random() * Math.PI * 2,
        }));
    const start = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(40, now - start) / 16;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of parts) {
        p.life -= (mode === "burst" ? 0.012 : 0.006) * dt;
        if (p.life <= 0 || p.y > h + 14) continue;
        alive = true;
        if (mode === "burst") {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.22 * dt;
        } else {
          p.sway += 0.06 * dt;
          p.x += (p.vx + Math.sin(p.sway) * 0.7) * dt; // defeated paper, fluttering
          p.y += p.vy * dt;
        }
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, 5, 9);
      }
      ctx.globalAlpha = 1;
      if (alive) rafs.current.push(requestAnimationFrame(frame));
    };
    rafs.current.push(requestAnimationFrame(frame));
  }, [reduceMotion]);

  const fire = useCallback(() => {
    if (phase !== "charging") return;
    clearTimers();
    const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const plan = planScan(seed, pool);
    planRef.current = plan;
    setResult(null);
    setNearFlash(null);
    setOvrDisplay(0);
    setCelebration(null);
    celebrationToken.current++;
    setManualSheet(false);
    setVaultOpen(false);
    setLocked({ pos: false, team: false, name: false, ovr: false });
    setPhase("scanning");

    const { card, delays } = plan;
    const finalNameAt = reduceMotion ? Math.min(delays.name, 260) : delays.name;

    // stream ticks: density tracks the deceleration curve
    tickTimes(finalNameAt, 16, 2).forEach((ms) =>
      after(ms, () => synth.tick()));

    after(delays.pos, () => { setLocked((l) => ({ ...l, pos: true })); synth.lock(0); pulse(HAPTICS.lock1); });
    after(delays.team, () => { setLocked((l) => ({ ...l, team: true })); synth.lock(1); pulse(HAPTICS.lock2); });

    if (plan.nearMiss && !reduceMotion) {
      after(Math.max(0, finalNameAt - 560), () => {
        setNearFlash(plan.nearMiss!.name);
        synth.nearMiss();
        pulse(HAPTICS.nearMiss);
        after(480, () => setNearFlash(null));
      });
    }
    after(finalNameAt, () => {
      setLocked((l) => ({ ...l, name: true }));
      synth.lock(2);
      pulse(HAPTICS.lock3);
      // OVR rollup tween
      const t0 = performance.now();
      rollupNotes(5, Math.min(120, delays.ovr / 6)).forEach((ms, i) =>
        after(delays.ovr * 0.1 + ms, () => synth.rollupNote(i)));
      const tween = (now: number) => {
        const k = Math.min(1, (now - t0) / delays.ovr);
        setOvrDisplay(Math.round(easeOutQuart(k) * card.rating));
        if (k < 1) rafs.current.push(requestAnimationFrame(tween));
      };
      rafs.current.push(requestAnimationFrame(tween));
    });
    after(finalNameAt + delays.ovr, () => {
      setLocked((l) => ({ ...l, ovr: true }));
      setOvrDisplay(card.rating);
      synth.lock(3, true);
      synth.stinger(card.tier, card.xfactor);
      pulse(HAPTICS[card.tier]);
      if (card.xfactor) after(260, () => pulse(HAPTICS.xfactor));
      setResult(card);
      setPhase("result");

      const verdict = verdictOf(card);
      const priorStreak = save.stats[save.source].cheekStreak;
      const outcome = recordPull(save, card, verdict, verdictRates.pPeak, verdictRates.pCheeks);
      const streak = outcome.streak;
      setSave(outcome.save);
      if (card.tier === "legend") {
        const team = teams[card.team];
        burst(["#fbbf24", team?.primary ?? "#38bdf8", "#ffffff", team?.secondary ?? "#a78bfa"]);
      }

      if (verdict) {
        // the judgment beat: silence after the number lands, then everything at once
        synth.duckCrowd(VERDICT_BEAT_MS + 400);
        after(VERDICT_BEAT_MS, () => {
          const pool = verdict === "peak" ? PEAK_LINES
            : verdict === "atomic" ? ATOMIC_CHEEKS_LINES : CHEEKS_LINES;
          const line = pool[Math.floor(Math.random() * pool.length)];
          const streakLine = verdict !== "peak"
            ? STREAK_LINES[streak]
            : priorStreak >= 3 ? "Streak broken. Redemption." : undefined;
          const token = ++celebrationToken.current;
          setCelebration({ kind: verdict, line, streakLine });
          synth.celebrate(verdict);
          pulse(HAPTICS[verdict === "peak" ? "peakJoy" : verdict]);
          if (!reduceMotion) {
            if (verdict === "peak") {
              const team = teams[card.team];
              burst(["#fbbf24", "#fde68a", "#ffffff", team?.primary ?? "#38bdf8"]);
            } else {
              burst(["#8b6f47", "#6b7280", "#4b5563", "#9ca3af"], "flutter");
            }
          }
          after(CELEBRATION_MS[verdict], () => {
            if (celebrationToken.current === token) setCelebration(null);
          });
        });
      }
    });
  }, [after, burst, clearTimers, phase, pool, pulse, reduceMotion, save, setSave, teams]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase === "scanning") return;
    e.preventDefault();
    synth.ensure();
    setPhase("charging");
    setChargeMs(0);
    synth.chargeStart();
    let lastLevel = -1;
    const t0 = performance.now();
    chargeTimer.current = window.setInterval(() => {
      const elapsed = performance.now() - t0;
      setChargeMs(elapsed);
      synth.chargeUpdate(elapsed);
      const level = chargeLevel(elapsed);
      if (level !== lastLevel) {
        pulse(HAPTICS[`charge${level}` as const]);
        lastLevel = level;
      }
    }, 60);
  };

  const onPointerUp = () => {
    if (phase !== "charging") return;
    if (chargeTimer.current !== null) {
      clearInterval(chargeTimer.current);
      chargeTimer.current = null;
    }
    synth.chargeStop();
    fire();
  };

  useEffect(() => () => {
    if (chargeTimer.current !== null) clearInterval(chargeTimer.current);
    synth.chargeStop();
  }, []);

  const team = shownTeam ? teams[shownTeam.team] : undefined;
  const chip = (key: "pos" | "team" | "name" | "ovr", label: string, value: string) =>
    <span key={key} className={`lock-chip ${locked[key] ? "locked" : ""}`} data-chip={key}>
      <em>{label}</em><b>{locked[key] ? value : "···"}</b>
    </span>;

  return (
    <div ref={rootRef} className={`scanner phase-${phase}${iOSShim ? " no-vibe" : ""}`}
      style={{ "--tp": team?.primary ?? "#1e293b", "--ts": team?.secondary ?? "#0f172a" } as React.CSSProperties}>
      <canvas ref={tickerRef} className="ticker" aria-hidden />
      <header className="topbar">
        <span className="brand">PEAKS<em>OR</em>CHEEKS</span>
        <div className="source-toggle" role="tablist" aria-label="Ratings source" data-testid="source-toggle">
          {SOURCES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={source === s}
              className={source === s ? "on" : ""}
              disabled={phase === "scanning" || phase === "charging"}
              onClick={() => switchSource(s)}>{sourceLabel(s, snapshots[s])}</button>
          ))}
        </div>
        <span className="pulls" data-testid="pulls">{stats.pulls} {stats.pulls === 1 ? "scan" : "scans"}</span>
        {best && <span className="best-chip" data-testid="best-chip">
          BEST {best.rating} · {best.name}</span>}
        <button className="icon-btn" aria-label="Settings" onClick={() => { pulse(HAPTICS.ui); setShowSettings((s) => !s); }}>⚙</button>
      </header>
      <div className={`scoreline tappable${sheetOpen ? " active" : ""}`} data-testid="scoreline"
        onClick={() => { pulse(HAPTICS.ui); setManualSheet((s) => !s); }}>
        <b className="gold">{stats.peaks} {stats.peaks === 1 ? "peak" : "peaks"}</b>
        <span className="sep">·</span>
        <b className="brown">{stats.cheeks} {stats.cheeks === 1 ? "cheek" : "cheeks"}</b>
        {stats.cheekStreak >= 2 && <>
          <span className="sep">·</span>
          <b className="streak">streak {stats.cheekStreak}</b>
        </>}
      </div>

      {showSettings && (
        <div className="settings" role="dialog" aria-label="Settings" data-testid="settings">
          <label><input type="checkbox" checked={save.soundOn}
            onChange={(e) => setSave((s) => ({ ...s, soundOn: e.target.checked }))} /> Sound effects</label>
          <label><input type="checkbox" checked={save.crowdOn}
            onChange={(e) => setSave((s) => ({ ...s, crowdOn: e.target.checked }))} /> Crowd ambience</label>
          <label><input type="checkbox" checked={save.hapticsOn}
            onChange={(e) => setSave((s) => ({ ...s, hapticsOn: e.target.checked }))} /> Haptics</label>
          <button className="reset" onClick={() => setSave((s) => ({
            ...s, stats: { ...s.stats, [s.source]: { pulls: 0, bestId: null, bestRating: -1, pullLog: [], cheekStreak: 0, peaks: 0, cheeks: 0, peaksExp: 0, cheeksExp: 0, varP: 0, varC: 0 } },
          }))}>Reset session</button>
        </div>
      )}

      <main className="stage-grid">
        <section className="stage">
          <div className="focus-wrap">
            <canvas ref={focusRef} className="focus" aria-label="Scan focus window" />
            <div className="near-flash" data-testid="near-flash" aria-hidden={nearFlash === null}>
              {nearFlash && <><b>{nearFlash}</b><span>97+ flashed by…</span></>}
            </div>
            <div className="lock-row" data-testid="lock-row">
              {chip("pos", "POSITION", planRef.current?.card.position ?? "")}
              {chip("team", "TEAM", planRef.current?.card.team ?? "")}
              {chip("name", "PLAYER", result?.name ?? planRef.current?.card.name ?? "")}
              {chip("ovr", "OVR", String(ovrDisplay || "···"))}
            </div>
          </div>
          <button className="scan-btn" data-testid="scan-btn"
            disabled={phase === "scanning"}
            style={{ "--charge": Math.min(1, chargeMs / 1400) } as React.CSSProperties}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}>
            <span>{phase === "charging" ? "RELEASE" : phase === "scanning" ? "SCANNING…" : "SCAN"}</span>
            <small>{phase === "idle" ? "hold to charge" : ""}</small>
          </button>
        </section>

        <section className={`side${sheetOpen ? " open" : ""}`}>
          <LuckGauge stats={stats} />
          {result ? (
            <div className={celebration && celebration.kind !== "peak" ? "result-col droop" : "result-col"}>
              <CardView card={result} team={teams[result.team]} size="lg" highlight tab={source === "m26" ? "M26" : "M27"} />
              <div className="result-actions">
                <button onClick={() => { pulse(HAPTICS.ui); setPhase("idle"); setManualSheet(false); planRef.current = null; }}>Scan again</button>
                <button onClick={async () => {
                  const ok = await copyText(cardText(result));
                  setCopied(ok);
                  after(1200, () => setCopied(false));
                }}>{copied ? "Copied ✓" : "Copy"}</button>
              </div>
            </div>
          ) : (
            <div className="placeholder" data-testid="placeholder">
              <p>Peak or cheeks.</p>
              <p className="sub">One button decides. Position, team, name, rating — real players, real ratings, zero mercy.</p>
            </div>
          )}
          <LuckStrip ticks={ticks} onOpen={() => { pulse(HAPTICS.ui); setVaultOpen(true); }} />
        </section>
      </main>

      <canvas ref={burstRef} className="burst" aria-hidden />

      <nav className="chips" aria-label="Position filter">
        {Object.keys(GROUPS).map((g) => (
          <button key={g} className={save.group === g ? "on" : ""}
            disabled={phase === "scanning" || phase === "charging"}
            onClick={() => { pulse(HAPTICS.ui); setSave((s) => ({ ...s, group: g })); }}>{g}</button>
        ))}
      </nav>
      {vaultOpen && (
        <Vault log={stats.pullLog} byId={byId} teams={teams} bestId={stats.bestId}
          onClose={() => { pulse(HAPTICS.ui); setVaultOpen(false); }} />
      )}
      {celebration && (
        <div className={`celebrate kind-${celebration.kind}`} data-testid="celebration"
          role="status" onClick={() => { celebrationToken.current++; setCelebration(null); }}>
          <div className="celebrate-wash" />
          {celebration.kind === "peak" && <div className="rays" />}
          <div className="stamp">
            {celebration.kind === "atomic" ? "ATOMIC CHEEKS." : celebration.kind === "cheeks" ? "CHEEKS." : "PEAK"}
          </div>
          <div className="cline">{celebration.line}</div>
          {celebration.streakLine && <div className="cline streak">{celebration.streakLine}</div>}
          <div className="skip-hint">tap to continue</div>
        </div>
      )}
    </div>
  );
}
