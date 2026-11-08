import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { synth } from "@/audio/synth";
import { chargeLevel, haptic, HAPTICS } from "@/haptics/haptics";
import type { PullPlan } from "./engine/game";
import {
  BREATH_MAX, BREATH_MIN, CARD_GROWTH, CARD_LIFT_PX, FLIGHT_MS, FULL_CHARGE_MS, PERFECT_SIN, REEL_TICK_MS,
  REEL_TICK_RM_MS, REEL_FIRST_MS, REEL_TAIL_MS, REEL_MS, STREAK_COUNT, VERDICT_BIG_MS, VERDICT_PLAIN_MS,
} from "./feel";

/** Imperative stage API the reveal sequence drives (the stage DOM never re-renders mid-pull). */
export interface StageApi {
  reel(plan: PullPlan, label: string, first: boolean): Promise<void>;
  verdict(plan: PullPlan, label: string): Promise<void>;
  fly(plan: PullPlan, label: string, target: Element | null): Promise<void>;
  reset(): void;
  stamp(i: 0 | 1, text: string, kind: "peak" | "cheeks" | "perfect" | "confirmed" | "flat"): void;
  burstAt(x: number, y: number, colors: string[], flutter: boolean): void;
}

export interface ActionStageProps {
  /** root element of the screen (FX canvas + vignette cover it) */
  rootRef: React.RefObject<HTMLDivElement | null>;
  locked: boolean; // busy, sheet open, quarter over, or nothing left to pull
  /** live check (read at press time, not render time) — a press during a landing pull is ignored */
  canCharge: () => boolean;
  hint: string;
  say: string;
  onRelease: (perfect: boolean) => void;
}

export const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const raf = (cb: FrameRequestCallback) =>
  (window.requestAnimationFrame ? window.requestAnimationFrame(cb) : window.setTimeout(() => cb(performance.now()), 16));

interface Particle { x: number; y: number; vx: number; vy: number; s: number; gold: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; dur: number; t0: number; col: string; w: number }
interface Bit { x: number; y: number; vx: number; vy: number; c: string; life: number; sway: number; flutter: boolean }

export const ActionStage = forwardRef<StageApi, ActionStageProps>(function ActionStage({ rootRef, locked, canCharge, hint, say, onRelease }, ref) {
  const cardRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const lblRef = useRef<HTMLSpanElement>(null);
  const bigRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vigRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const stampRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const canChargeRef = useRef(canCharge);
  canChargeRef.current = canCharge;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;

  const C = useRef({ active: false, t0: 0, last: 0, level: 0, phase: 0, hap: -1 });
  const dead = useRef(false); // unmounted: every loop, timer, and API call goes quiet
  const fx = useRef({ ctx: null as CanvasRenderingContext2D | null, w: 0, h: 0, parts: [] as Particle[], rings: [] as Ring[], bits: [] as Bit[], running: false, last: 0 });

  const setFace = (lbl: string, big: string, sub: string) => {
    if (lblRef.current) lblRef.current.textContent = lbl;
    if (bigRef.current) bigRef.current.textContent = big;
    if (subRef.current) subRef.current.textContent = sub;
  };
  const card = () => cardRef.current!;
  const face = () => faceRef.current!;
  const rootRect = () => rootRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
  const cardCenter = () => {
    const pr = rootRect(), cr = card().getBoundingClientRect();
    return { x: cr.left - pr.left + cr.width / 2, y: cr.top - pr.top + cr.height / 2, r: Math.max(cr.width, cr.height) / 2 };
  };

  const fxSize = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = rootRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    fx.current.w = r.width;
    fx.current.h = r.height;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    try { fx.current.ctx = cv.getContext("2d"); } catch { fx.current.ctx = null; }
    fx.current.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const spawn = (p: Partial<Particle>, tgt: { x: number; y: number }): Particle => {
    const F = fx.current;
    let x = 0, y = 0;
    for (let k = 0; k < 8; k++) { x = Math.random() * F.w; y = Math.random() * F.h; if (Math.hypot(x - tgt.x, y - tgt.y) >= 150) break; }
    return Object.assign(p, { x, y, vx: 0, vy: 0, s: 0.6 + Math.random() * 0.8, gold: Math.random() < 0.35 }) as Particle;
  };
  const kick = () => { if (!fx.current.running) { fx.current.running = true; fx.current.last = performance.now(); raf(loop); } };

  /** The charge: the card breathes in the universe. */
  const chargeFrame = (now: number) => {
    const c = C.current;
    const el = now - c.t0, dt = now - c.last;
    c.last = now;
    c.level = Math.min(1, el / FULL_CHARGE_MS);
    const full = el > FULL_CHARGE_MS;
    c.phase += (dt / 1000) * (BREATH_MIN + c.level * (BREATH_MAX - BREATH_MIN)) * Math.PI * 2;
    const breath = Math.sin(c.phase), rm = reduceMotion();
    const scale = rm ? 1 : 1 + c.level * CARD_GROWTH + breath * (0.015 + c.level * 0.05);
    const shiver = full && !rm ? (Math.random() - 0.5) * 2.4 : 0;
    card().style.transform = `translate(${shiver.toFixed(2)}px, ${(rm ? 0 : -c.level * CARD_LIFT_PX).toFixed(1)}px) scale(${scale.toFixed(4)})`;
    card().style.setProperty("--glow", Math.min(1.25, 0.15 + c.level * 0.85 + Math.max(0, breath) * 0.22 * c.level).toFixed(3));
    const cc = cardCenter();
    vigRef.current?.style.setProperty("--cx", cc.x + "px");
    vigRef.current?.style.setProperty("--cy", cc.y + "px");
    if (vigRef.current) vigRef.current.style.opacity = (c.level * 0.82).toFixed(3);
    const hl = chargeLevel(el);
    if (hl !== c.hap) { haptic(HAPTICS[`charge${hl}` as const]); if (c.hap >= 0) synth.tick(); c.hap = hl; }
    if (subRef.current) subRef.current.textContent = full ? "LET GO" : "CHARGING";
    synth.formationRiserUpdate(c.level, breath);
    return cc;
  };

  const loop = (now: number) => {
    const F = fx.current, c = C.current;
    if (dead.current || !cardRef.current) { F.running = false; c.active = false; return; }
    const k = Math.min(3, (now - F.last) / 16.7);
    F.last = now;
    const ctx = F.ctx;
    ctx?.clearRect(0, 0, F.w, F.h);
    if (c.active) {
      const tgt = chargeFrame(now);
      if (ctx && !reduceMotion()) {
        const lvl = c.level, inhale = 0.5 + 0.5 * Math.cos(c.phase);
        const pull = (0.035 + lvl * lvl * 0.3) * (0.4 + inhale), swirl = 0.025 + lvl * 0.05;
        ctx.lineCap = "round";
        for (const p of F.parts) {
          const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy) || 1;
          p.vx = (p.vx + ((dx / d) * pull * p.s + (-dy / d) * swirl) * k) * 0.955;
          p.vy = (p.vy + ((dy / d) * pull * p.s + (dx / d) * swirl) * k) * 0.955;
          p.x += p.vx * k;
          p.y += p.vy * k;
          if (d < tgt.r * 0.55) { spawn(p, tgt); continue; }
          const a = Math.min(1, 0.15 + Math.hypot(p.vx, p.vy) * 0.12) * (0.35 + lvl * 0.65);
          ctx.strokeStyle = p.gold && lvl > 0.7 ? `rgba(253,230,138,${a.toFixed(3)})` : `rgba(140,205,255,${a.toFixed(3)})`;
          ctx.lineWidth = 1 + lvl * 1.2;
          const tail = 3 + lvl * 4;
          ctx.beginPath(); ctx.moveTo(p.x - p.vx * tail, p.y - p.vy * tail); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        if (lvl > 0.55) {
          ctx.strokeStyle = "rgba(220,240,255,0.85)"; ctx.lineWidth = 1.4; ctx.shadowColor = "rgba(140,205,255,0.9)"; ctx.shadowBlur = 8;
          for (let i = 0; i < (lvl >= 1 ? 4 : 2); i++) {
            if (Math.random() < 0.35) continue;
            let ang = Math.random() * Math.PI * 2, r = tgt.r * 0.9;
            ctx.beginPath(); ctx.moveTo(tgt.x + Math.cos(ang) * r, tgt.y + Math.sin(ang) * r);
            for (let s = 0; s < 5; s++) { r += 7 + Math.random() * 6; ang += (Math.random() - 0.5) * 0.5; ctx.lineTo(tgt.x + Math.cos(ang) * r, tgt.y + Math.sin(ang) * r); }
            ctx.stroke();
          }
          ctx.shadowBlur = 0;
          if (Math.random() < 0.07 * lvl) synth.crackle();
        }
        if (lvl >= 1) {
          const ph = (now % 600) / 600;
          ctx.strokeStyle = `rgba(200,235,255,${(0.5 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(tgt.x, tgt.y, tgt.r + ph * 46, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    F.rings = F.rings.filter((rg) => {
      const t = (now - rg.t0) / rg.dur;
      if (t >= 1) return false;
      if (t < 0 || !ctx) return true;
      ctx.strokeStyle = `rgba(${rg.col},${((1 - t) * 0.75).toFixed(3)})`; ctx.lineWidth = 2 + rg.w * (1 - t);
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r0 + t * rg.r1, 0, Math.PI * 2); ctx.stroke();
      return true;
    });
    F.bits = F.bits.filter((b) => {
      b.life -= (b.flutter ? 0.007 : 0.014) * k;
      if (b.life <= 0 || b.y > F.h + 10) return false;
      if (b.flutter) { b.sway += 0.06 * k; b.x += (b.vx + Math.sin(b.sway) * 0.7) * k; b.y += b.vy * k; }
      else { b.x += b.vx * k; b.y += b.vy * k; b.vy += 0.22 * k; }
      if (ctx) { ctx.globalAlpha = Math.min(1, b.life); ctx.fillStyle = b.c; ctx.fillRect(b.x, b.y, 5, 9); ctx.globalAlpha = 1; }
      return true;
    });
    if (c.active || F.rings.length || F.bits.length) raf(loop);
    else { F.running = false; ctx?.clearRect(0, 0, F.w, F.h); }
  };

  const chargeStart = () => {
    if (C.current.active || !canChargeRef.current()) return;
    synth.ensure();
    const c = C.current;
    Object.assign(c, { active: true, t0: performance.now(), last: performance.now(), level: 0, phase: -Math.PI / 2, hap: -1 });
    card().classList.remove("idle");
    card().style.transition = "none";
    face().className = "fm-face back";
    setFace("THE DECK", "?", "CHARGING");
    vigRef.current?.classList.add("live");
    btnRef.current?.classList.add("held");
    fxSize();
    const tgt = cardCenter();
    fx.current.parts = Array.from({ length: STREAK_COUNT }, () => spawn({}, tgt));
    synth.formationRiserStart();
    kick();
  };

  const release = () => {
    const c = C.current;
    if (!c.active) return;
    c.active = false;
    const perfect = c.level >= 1 && Math.sin(c.phase) > PERFECT_SIN;
    synth.formationRiserStop();
    vigRef.current?.classList.remove("live");
    btnRef.current?.classList.remove("held");
    synth.kick();
    haptic(HAPTICS.kick);
    const root = rootRef.current;
    if (root && !reduceMotion()) { root.classList.remove("quake"); void root.offsetWidth; root.classList.add("quake"); }
    const tgt = cardCenter(), now = performance.now(), F = fx.current;
    F.rings.push({ x: tgt.x, y: tgt.y, r0: tgt.r, r1: Math.max(F.w, F.h) * (0.4 + c.level * 0.5), dur: 420, t0: now, col: "200,235,255", w: 2 + c.level * 3 });
    if (perfect) {
      F.rings.push({ x: tgt.x, y: tgt.y, r0: tgt.r * 0.5, r1: Math.max(F.w, F.h), dur: 640, t0: now + 70, col: "253,230,138", w: 5 });
      synth.perfect();
      haptic(HAPTICS.formationPerfect);
      api.stamp(1, "PERFECT", "perfect");
      const fl = flashRef.current;
      if (fl) { fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go"); }
    }
    kick();
    onReleaseRef.current(perfect);
  };

  const api: StageApi = {
    async reel(plan, label, first) {
      if (dead.current || !cardRef.current) return;
      const rm = reduceMotion();
      card().classList.remove("idle");
      card().style.opacity = "1";
      card().style.transition = "transform .35s cubic-bezier(.2,1.2,.4,1)";
      card().style.transform = `translate(0, -10px) scale(${rm ? 1 : first ? 1.3 : 1.18})`;
      card().style.setProperty("--glow", "0.5");
      face().className = "fm-face reel";
      const spinMs = rm ? 120 : first ? REEL_FIRST_MS : REEL_MS;
      if (!rm) face().animate?.([{ transform: "rotateY(0deg)" }, { transform: `rotateY(${first ? 1440 : 1080}deg)` }], { duration: spinMs, easing: "cubic-bezier(.12,.75,.25,1)" });
      const t0 = performance.now();
      await new Promise<void>((res) => {
        const iv = setInterval(() => {
          if (dead.current || performance.now() - t0 > spinMs - REEL_TAIL_MS) { clearInterval(iv); res(); return; }
          synth.tick();
          setFace(label, "#" + (1 + Math.floor(Math.random() * 98)), "");
        }, rm ? REEL_TICK_RM_MS : REEL_TICK_MS);
      });
      await sleep(rm ? 0 : 110);
      void plan;
    },
    async verdict(plan, label) {
      if (dead.current || !cardRef.current) return;
      const rm = reduceMotion();
      face().className = "fm-face " + plan.face;
      setFace(label, plan.num, plan.sub);
      if (plan.face === "gold") {
        synth.celebrate("peak"); haptic(HAPTICS.formationPeak); api.stamp(0, "PEAK", "peak");
        const c = cardCenter(); api.burstAt(c.x, c.y, ["#fde68a", "#fbbf24", "#fff7d6"], false);
      } else if (plan.face === "brown") {
        synth.celebrate("cheeks"); haptic(HAPTICS.formationCheeks); api.stamp(0, "CHEEKS", "cheeks");
        const c = cardCenter(); api.burstAt(c.x, c.y, ["#b07a4c", "#7c4a21", "#8d99ab"], true);
        card().style.transition = "transform .6s ease-in";
        card().style.transform = `translate(0, -2px) scale(${rm ? 1 : 1.18}) rotate(-4deg)`;
      } else {
        synth.lock(2);
      }
      await sleep(rm ? 60 : plan.face === "plain" ? VERDICT_PLAIN_MS : VERDICT_BIG_MS);
    },
    fly(plan, label, target) {
      return new Promise<void>((done) => {
        if (dead.current || !cardRef.current) { done(); return; }
        const a = card().getBoundingClientRect();
        if (!target || reduceMotion() || !document.body.animate) { card().style.opacity = "0"; done(); return; }
        const b = target.getBoundingClientRect();
        const clone = document.createElement("div");
        clone.className = "fm-clone" + (plan.face === "gold" ? " gold" : plan.face === "brown" ? " brown" : "");
        const n = document.createElement("span"); n.className = "n"; n.textContent = plan.num;
        const p = document.createElement("span"); p.className = "p"; p.textContent = plan.sub || label;
        clone.append(n, p);
        (rootRef.current ?? document.body).appendChild(clone);
        const x0 = a.left + a.width / 2 - 26, y0 = a.top + a.height / 2 - 29.5;
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        const s0 = a.width / 52, s1 = b.width / 52;
        card().style.opacity = "0";
        synth.whoosh();
        const anim = clone.animate([
          { transform: `translate(${x0}px, ${y0}px) scale(${s0}) rotate(0deg)` },
          { transform: `translate(${x0 + dx * 0.55}px, ${y0 + dy - 48}px) scale(${(s0 + s1) / 2 + 0.15}) rotate(-8deg)`, offset: 0.55 },
          { transform: `translate(${x0 + dx}px, ${y0 + dy}px) scale(${s1}) rotate(0deg)` },
        ], { duration: FLIGHT_MS, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" });
        anim.onfinish = () => { clone.remove(); done(); };
      });
    },
    reset() {
      if (dead.current || !cardRef.current) return;
      const el = card();
      el.style.transition = "transform .32s cubic-bezier(.2,1.4,.4,1), opacity .2s";
      el.style.opacity = "1";
      el.style.transform = "";
      el.style.setProperty("--glow", "0.15");
      face().className = "fm-face back";
      setFace("THE DECK", "?", "HOLD ME");
      el.classList.add("idle");
      if (vigRef.current) vigRef.current.style.opacity = "0";
    },
    stamp(i, text, kind) {
      const el = stampRefs[i].current;
      if (!el) return;
      el.className = `fm-stamp s${i + 1}`;
      el.textContent = text;
      void el.offsetWidth;
      el.className = `fm-stamp s${i + 1} go ${kind}`;
    },
    burstAt(x, y, colors, flutter) {
      if (reduceMotion()) return;
      if (!fx.current.ctx) fxSize();
      for (let i = 0; i < (flutter ? 40 : 70); i++) {
        fx.current.bits.push(flutter
          ? { x: x - 120 + Math.random() * 240, y: y - 160 - Math.random() * 40, vx: (Math.random() - 0.5) * 1.1, vy: 0.35 + Math.random() * 0.9, c: colors[Math.floor(Math.random() * colors.length)], life: 1.6, sway: Math.random() * 6, flutter: true }
          : { x, y, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 8 - 2, c: colors[Math.floor(Math.random() * colors.length)], life: 1, sway: 0, flutter: false });
      }
      kick();
    },
  };
  useImperativeHandle(ref, () => api);

  useEffect(() => {
    const up = () => { if (C.current.active) release(); };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    dead.current = false;
    return () => {
      dead.current = true;
      C.current.active = false;
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      synth.formationRiserStop();
    };
    // release/api are stable closures over refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    chargeStart();
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); chargeStart(); }
  };
  const keyUp = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); release(); }
  };

  return (
    <>
      <div className="fm-action">
        <div className="fm-bg" aria-hidden="true" />
        <div className="fm-stage">
          <div ref={cardRef} className="fm-card idle" data-testid="deck-card" onPointerDown={down}
            aria-label="The deck. Press and hold to charge, release to pull.">
            <div ref={faceRef} className="fm-face back">
              <span ref={lblRef} className="fm-lbl">THE DECK</span>
              <span ref={bigRef} className="fm-big">?</span>
              <span ref={subRef} className="fm-sub">HOLD ME</span>
            </div>
          </div>
          <div ref={stampRefs[0]} className="fm-stamp s1" data-testid="stamp-0" aria-hidden="true" />
          <div ref={stampRefs[1]} className="fm-stamp s2" data-testid="stamp-1" aria-hidden="true" />
        </div>
        <div className="fm-say" aria-live="polite">{say}</div>
        <div className="fm-spinrow">
          <button ref={btnRef} type="button" className="fm-spin" data-testid="hold-btn" disabled={locked}
            onPointerDown={down} onKeyDown={keyDown} onKeyUp={keyUp}>HOLD<small>{hint}</small></button>
        </div>
      </div>
      <div ref={vigRef} className="fm-vig" aria-hidden="true" />
      <canvas ref={canvasRef} className="fm-fx" aria-hidden="true" />
      <div ref={flashRef} className="fm-flash" aria-hidden="true" />
    </>
  );
});
