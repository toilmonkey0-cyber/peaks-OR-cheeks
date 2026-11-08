import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { synth } from "@/audio/synth";
import { haptic, HAPTICS } from "@/haptics/haptics";
import type { Team } from "@/data/schema";
import { makeRng } from "@/engine/rng";
import type { TeamLineups } from "./engine/lineups";
import {
  applyPlay, buyScheme, call, commitPull, createGame, eligible, filmSlot, finalScore, nextQuarter, planPull, playPeak,
  spendPeak, startPull, type GameState, type Play, type PullPlan,
} from "./engine/game";
import { ActionStage, reduceMotion, type StageApi } from "./ActionStage";
import {
  CONFIRMED_LINGER_MS, CONFIRMED_PRE_WAVE_MS, CONFIRMED_WAVE_STAGGER_MS, FLAT_DEAD_AIR_MS, FLAT_HOLD_MS,
  LANDING_BEAT_MS, PEAK_QUARTER_PULLS, TURNOVER_HOLD_MS,
} from "./feel";
import { Field } from "./Field";
import { CallSheet, DetailSheet, OverSheet, PeakSheet, PlaysSheet, TapeSheet } from "./sheets";
import { teamViews } from "./teams";
import { loadFormationSave, recordFinishedGame, writeFormationSave } from "./store";
import "./FormationScreen.css";

export interface FormationScreenProps {
  lineups: Record<string, TeamLineups>;
  teams: Team[];
  onExit: () => void;
  /** test hooks: deterministic teams + seed, or a whole game state (resume reuses this) */
  initialTeams?: [string, string];
  seed?: string;
  initialGame?: GameState;
}

type SheetState =
  | null
  | { type: "call"; side: 0 | 1 }
  | { type: "peak"; side: 0 | 1; index: number }
  | { type: "plays"; from: "bank" }
  | { type: "plays"; from: "peak"; side: 0 | 1; index: number }
  | { type: "detail"; side: 0 | 1; index: number }
  | { type: "tape" };

const newSeed = () => "fm-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function FormationScreen({ lineups, teams, onExit, initialTeams, seed, initialGame }: FormationScreenProps) {
  const teamMap = useMemo(() => teamViews(teams), [teams]);
  const seedRef = useRef(seed ?? newSeed());
  const saveRef = useRef(loadFormationSave());
  const gameRef = useRef<GameState | null>(null);
  if (!gameRef.current) {
    gameRef.current = initialGame
      ?? (initialTeams ? createGame(seedRef.current, lineups, initialTeams) : saveRef.current.inProgress ?? createGame(seedRef.current, lineups));
  }
  const g = gameRef.current;
  const rngRef = useRef(makeRng(seedRef.current + ":pulls"));
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageApi>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [landing, setLanding] = useState<Set<string>>(new Set());
  const [wave, setWave] = useState<Set<string>>(new Set());
  const [enterTint, setEnterTint] = useState<number | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const sheetRef = useRef<SheetState>(null);
  sheetRef.current = sheet;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const emptyPool = !g.over && eligible(g).length === 0;
  const canCharge = () => !busyRef.current && !sheetRef.current && !gameRef.current!.over && eligible(gameRef.current!).length > 0;

  /** THE PULL, after the release: plan → reel → verdict → flight → commit (game state changes only on landing). */
  const onRelease = async (perfect: boolean) => {
    const stage = stageRef.current;
    const game = gameRef.current!;
    if (busyRef.current || game.over || !stage) return;
    busyRef.current = true;
    setBusy(true);
    if (perfect) game.perfects++;
    const n = startPull(game);
    const plans: PullPlan[] = [];
    for (let k = 0; k < n; k++) { const p = planPull(game, rngRef.current); if (p) plans.push(p); }
    bump();
    for (let k = 0; k < plans.length; k++) {
      const p = plans[k];
      const label = (p.side ? "DEF " : "OFF ") + game.sides[p.side].lineup[p.index].label;
      await stage.reel(p, label, k === 0);
      if (!alive.current) return;
      await stage.verdict(p, label);
      if (!alive.current) return;
      const target = rootRef.current?.querySelector(`[data-testid="slot-${p.side}-${p.index}"]`) ?? null;
      await stage.fly(p, label, target);
      if (!alive.current) return;
      commitPull(game, p);
      persist();
      setLanding(new Set([`${p.side}-${p.index}`]));
      bump();
      synth.landThud();
      haptic(HAPTICS.formationLand);
      await sleep(reduceMotion() ? 30 : LANDING_BEAT_MS);
      if (!alive.current) return;
    }
    if (!alive.current) return;
    stage.reset();
    setLanding(new Set());
    busyRef.current = false;
    setBusy(false);
  };

  const close = () => setSheet(null);
  const done = () => { setSheet(null); persist(); bump(); };

  const lock = (on: boolean) => { busyRef.current = on; setBusy(on); };
  /** Save at stable points only — never between a release and its landing — so a killed tab resumes cleanly. */
  const persist = () => {
    // never serialize an in-flight plan (a tab-kill would resume having counted the spin with no clue landed)
    if (gameRef.current?.sides.some((S) => S.slots.some((x) => x.pending))) return;
    saveRef.current = { ...saveRef.current, inProgress: gameRef.current };
    writeFormationSave(saveRef.current);
  };

  /** Center of one side's half of the field, in root coordinates (for the confetti). */
  const sideCenter = (side: 0 | 1) => {
    const root = rootRef.current?.getBoundingClientRect();
    const f = rootRef.current?.querySelector('[data-testid="fm-field"]')?.getBoundingClientRect();
    if (!root || !f) return { x: 0, y: 0 };
    return { x: f.left - root.left + f.width / 2, y: f.top - root.top + f.height * (side ? 0.25 : 0.75) };
  };

  /** The call. Right = the house reviews it and the call stands (a spectacle). Wrong = "no." and nothing else. */
  const callSide = async (side: 0 | 1, abbr: string) => {
    const game = gameRef.current!;
    const stage = stageRef.current;
    if (busyRef.current || game.over || !stage) return;
    setSheet(null);
    synth.ensure();
    lock(true);
    const r = call(game, side, abbr);
    persist();
    bump();
    const rm = reduceMotion();
    if (r.correct) {
      stage.stamp(0, "CONFIRMED.", "confirmed");
      synth.fanfare();
      haptic(HAPTICS.formationPeak);
      setEnterTint(side);
      await sleep(rm ? 0 : CONFIRMED_PRE_WAVE_MS);
      if (!alive.current) return;
      const order = game.sides[side].lineup.map((_, i) => i);
      if (side === 0) order.reverse(); // the offense wave ends on the QB
      for (let k = 0; k < order.length; k++) {
        const key = `${side}-${order[k]}`;
        setWave((prev) => new Set(prev).add(key));
        synth.waveTick(k);
        if (k % 3 === 0) haptic(HAPTICS.formationWave);
        await sleep(rm ? 0 : CONFIRMED_WAVE_STAGGER_MS);
        if (!alive.current) return;
      }
      const c = sideCenter(side);
      stage.burstAt(c.x, c.y, ["#fde68a", "#fbbf24", "#fff7d6"], false);
      if (r.quarterEnded && game.over!.score <= PEAK_QUARTER_PULLS) { synth.celebrate("peak"); haptic(HAPTICS.peakJoy); }
      await sleep(rm ? 0 : CONFIRMED_LINGER_MS);
    } else if (r.quarterEnded) {
      // the last down: endings deserve theater even when wrong
      stage.stamp(0, "TURNOVER", "cheeks");
      synth.celebrate("cheeks");
      haptic(HAPTICS.formationCheeks);
      const c = sideCenter(side);
      stage.burstAt(c.x, c.y, ["#b07a4c", "#7c4a21", "#8d99ab"], true);
      await sleep(rm ? 200 : TURNOVER_HOLD_MS);
    } else {
      // dead air, then the flattest possible answer
      await sleep(rm ? 120 : FLAT_DEAD_AIR_MS);
      if (!alive.current) return;
      stage.stamp(1, "no.", "flat");
      synth.thunk();
      haptic(HAPTICS.formationFlat);
      await sleep(rm ? 200 : FLAT_HOLD_MS);
    }
    if (!alive.current) return;
    setWave(new Set());
    setEnterTint(null);
    lock(false);
  };

  const onSlot = (side: 0 | 1, index: number) => {
    if (busyRef.current) return; // a second thumb can't open a sheet mid-pull
    const s = g.sides[side].slots[index];
    if (filmSlot(g, side, index)) { persist(); bump(); return; }
    if (s.fd && !g.over) setSheet({ type: "peak", side, index });
    else setSheet({ type: "detail", side, index });
  };
  const onPlay = (play: Play) => {
    if (sheet?.type === "plays" && sheet.from === "peak") spendPeak(g, sheet.side, sheet.index, play);
    else applyPlay(g, play);
    done();
  };
  const onNext = () => {
    nextQuarter(g, lineups, makeRng(seedRef.current + ":q" + (g.quarter + 1)));
    done();
  };
  const onNewGame = () => {
    const finished = gameRef.current!;
    if (finished.over && finished.quarter >= 4) saveRef.current = recordFinishedGame(saveRef.current, finalScore(finished));
    seedRef.current = newSeed();
    gameRef.current = createGame(seedRef.current, lineups);
    rngRef.current = makeRng(seedRef.current + ":pulls");
    done();
  };

  const say = emptyPool ? "Every clue is out. Make the call." : g.log[0]?.text ?? `Q${g.quarter}: two teams are hiding. Hold the card.`;
  const hint = g.noHuddle ? "NO-HUDDLE ×2" : g.film ? "FILM: TAP A SLOT" : "RELEASE TO PULL";
  const sideBar = (side: 0 | 1) => {
    const S = g.sides[side];
    const known = S.solved || g.over !== null;
    const t = teamMap.get(S.team);
    const label = side ? "defense" : "offense";
    return (
      <div className="fm-bar">
        <span className="side">{side ? "DEFENSE" : "OFFENSE"}</span>
        {known && t
          ? <span className="who on" style={{ ["--team" as string]: t.color } as React.CSSProperties}>{t.full}{S.solved ? " ✓" : ""}</span>
          : <span className="who">?</span>}
        {side === 1 && <button type="button" className="fm-tape" onClick={() => setSheet({ type: "tape" })}>TAPE</button>}
        {!known && (
          <button type="button" className="fm-call" aria-label={`CALL the ${label}`} disabled={busy} onClick={() => setSheet({ type: "call", side })}>CALL</button>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="fm" data-testid="formation-screen"
      data-offense={import.meta.env.MODE === "test" ? g.sides[0].team : undefined}
      data-defense={import.meta.env.MODE === "test" ? g.sides[1].team : undefined}>
      <div className="fm-top">
        <div className="fm-hud">
          <button type="button" className="fm-back" aria-label="Back to the scanner" onClick={onExit}>‹</button>
          <span className="fm-q">Q{g.quarter}</span>
          <span className="fm-downs" role="img" aria-label={`${g.downs} downs left`}>
            {[0, 1, 2, 3].map((k) => <i key={k} data-testid="down-pip" data-on={k < g.downs ? "true" : "false"} className={k < g.downs ? "" : "off"} />)}
          </span>
          <span className="fm-stat"><small>SPINS</small>{g.pulls}</span>
          <span className="fm-stat"><small>GAME</small>{g.total + (g.over ? 0 : g.pulls)}</span>
          <button type="button" className="fm-chips" disabled={busy || !g.chips || !!g.over} aria-label={`${g.chips} banked chips`}
            onClick={() => setSheet({ type: "plays", from: "bank" })}>◆ {g.chips}</button>
        </div>
        {sideBar(1)}
        <Field game={g} teams={teamMap} landing={landing} enterTint={enterTint} wave={wave} onSlot={onSlot} />
        {sideBar(0)}
      </div>

      <ActionStage ref={stageRef} rootRef={rootRef} locked={busy || !!sheet || !!g.over || emptyPool}
        canCharge={canCharge} hint={hint} say={say} onRelease={(perfect) => { void onRelease(perfect); }} />

      {sheet?.type === "call" && <CallSheet game={g} side={sheet.side} teams={teamMap} onClose={close} onPick={(abbr) => { void callSide(sheet.side, abbr); }} />}
      {sheet?.type === "peak" && (
        <PeakSheet game={g} side={sheet.side} index={sheet.index}
          onPlay={() => { playPeak(g, sheet.side, sheet.index); done(); }}
          onSpend={() => setSheet({ type: "plays", from: "peak", side: sheet.side, index: sheet.index })}
          onLeave={close} />
      )}
      {sheet?.type === "plays" && <PlaysSheet game={g} title={sheet.from === "bank" ? "SPEND A CHIP" : "SPEND THE PEAK"} onPick={onPlay} onClose={close} />}
      {sheet?.type === "detail" && <DetailSheet game={g} side={sheet.side} index={sheet.index} onClose={close} />}
      {sheet?.type === "tape" && <TapeSheet log={g.log} onClose={close} />}
      {!sheet && !busy && g.over && <OverSheet game={g} teams={teamMap} onNext={onNext} onNewGame={onNewGame} onBuy={(w) => { buyScheme(g, w); persist(); bump(); }} />}
    </div>
  );
}
