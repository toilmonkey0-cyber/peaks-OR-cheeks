import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { synth } from "@/audio/synth";
import { haptic, HAPTICS } from "@/haptics/haptics";
import type { Team } from "@/data/schema";
import { makeRng } from "@/engine/rng";
import type { TeamLineups } from "./engine/lineups";
import {
  applyPlay, buyScheme, call, commitPull, createGame, eligible, filmSlot, finalScore, nextQuarter, planPull, playPeak, pullRng,
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
import { clearQueued, ensurePlayer, loadFormationSave, queueScore, recordFinishedGame, recordWallSolve, writeFormationSave } from "./store";
import { WallSheet } from "./WallSheet";
import { ModeSheet } from "./sheets";
import { BoardSheet, GroupSheet } from "./GroupSheet";
import { finishDaily, freshDaily, gameFromPayload, localDay, nextPublishedQuarter, nextStreak, startDaily } from "./engine/daily";
import { apiBase, createGroup, fetchBoard, fetchDaily, joinGroup, postScore, type Board } from "./api";
import { shareLine } from "./share";
import { copyText } from "@/util/clipboard";
import "./FormationScreen.css";

export interface FormationScreenProps {
  lineups: Record<string, TeamLineups>;
  teams: Team[];
  dataVersion: string; // the roster snapshot id — part of the daily seed
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
  | { type: "tape" }
  | { type: "wall" }
  | { type: "groups" }
  | { type: "board" };

const newSeed = () => "fm-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function FormationScreen({ lineups, teams, dataVersion, onExit, initialTeams, seed, initialGame }: FormationScreenProps) {
  const teamMap = useMemo(() => teamViews(teams), [teams]);
  const seedRef = useRef(seed ?? newSeed());
  const saveRef = useRef(loadFormationSave());
  const today = localDay(); // captured once per mount — the local day this session plays under
  if (!saveRef.current.playerId) { saveRef.current = ensurePlayer(saveRef.current); }
  const gameRef = useRef<GameState | null>(null);
  // entry: a daily in progress always resumes (one attempt must be finishable, even across midnight);
  // a free game auto-resumes only once today's daily is out of the way — the chooser wins while it waits
  const dailyPending = !(saveRef.current.daily && saveRef.current.daily.day === today && saveRef.current.daily.result);
  const wantDaily = !!saveRef.current.dailyGame;
  const wantFree = !wantDaily && !!saveRef.current.inProgress && !dailyPending;
  if (!gameRef.current) {
    if (wantDaily) { gameRef.current = saveRef.current.dailyGame!; }
    else if (wantFree) { gameRef.current = saveRef.current.inProgress!; }
    else if (initialGame) { gameRef.current = initialGame; }
    else if (initialTeams) { gameRef.current = createGame(seedRef.current, lineups, initialTeams); }
    else gameRef.current = createGame(seedRef.current, lineups);
  }
  // test hooks (initialGame/initialTeams) mount straight into play as free practice
  const [entered] = useState<"daily" | "free" | "chooser">(() =>
    initialGame || initialTeams ? "free" : wantDaily ? "daily" : wantFree ? "free" : "chooser");
  const g = gameRef.current;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageApi>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chooser" | "play">(() => (entered === "chooser" ? "chooser" : "play"));
  const [landing, setLanding] = useState<Set<string>>(new Set());
  const [wave, setWave] = useState<Set<string>>(new Set());
  const [enterTint, setEnterTint] = useState<number | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [mode, setMode] = useState<"chooser" | "daily" | "free">(() => (entered === "chooser" ? "chooser" : entered));
  const [shared, setShared] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const sheetRef = useRef<SheetState>(null);
  sheetRef.current = sheet;
  const viewRef = useRef(view);
  viewRef.current = view;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const emptyPool = !g.over && eligible(g).length === 0;
  const playing = () => viewRef.current === "play";
  const canCharge = () => playing() && !busyRef.current && !sheetRef.current && !gameRef.current!.over && eligible(gameRef.current!).length > 0;

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
    for (let k = 0; k < n; k++) { const p = planPull(game, pullRng(game.seed, game.pulls - 1)); if (p) plans.push(p); }
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
    const game = gameRef.current;
    if (mode === "chooser") return; // no mode owns this game yet — the chooser is modal
    if (mode === "daily") {
      saveRef.current = { ...saveRef.current, dailyGame: game };
    } else if (game) {
      saveRef.current = { ...saveRef.current, inProgress: game };
    }
    writeFormationSave(saveRef.current);
  };
  const startMode = (m: "daily" | "free") => {
    if (m === "daily") {
      void startDailyMode();
      return;
    } else {
      const g = saveRef.current.inProgress ?? createGame(newSeed(), lineups); // resume beats discard
      saveRef.current = { ...saveRef.current, inProgress: g };
      gameRef.current = g;
    }
    setMode(m);
    setView("play");
    writeFormationSave(saveRef.current);
    bump();
  };
  /** TODAY: the Worker's published daily when reachable, else the cached one, else the phase-B local seed. */
  const startDailyMode = async () => {
    const d = startDaily(saveRef.current.daily ?? freshDaily(), today, dataVersion);
    setMode("daily");
    setView("play");
    setSheet(null);
    let payload = apiBase() ? await fetchDaily(today, dataVersion) : null;
    if (!payload && saveRef.current.published?.day === today) payload = saveRef.current.published;
    const g = payload ? gameFromPayload(payload, 0) : createGame(d.seed, lineups);
    saveRef.current = { ...saveRef.current, daily: d, dailyGame: g, ...(payload ? { published: payload } : {}) };
    gameRef.current = g;
    writeFormationSave(saveRef.current);
    bump();
  };

  /** Post today's result to every group; anything that fails queues and flushes on next contact. */
  const submitDailyResult = async () => {
    const g = gameRef.current!;
    const d = saveRef.current.daily;
    if (!d || !saveRef.current.playerId) return;
    const post = {
      day: d.day, playerId: saveRef.current.playerId, nick: saveRef.current.nick || "PLAYER",
      score: finalScore(g), detailJson: JSON.stringify({ quarters: g.quartersSolved, perfects: g.perfects, turnovers: g.turnovers }),
    };
    for (const grp of saveRef.current.groups) {
      const ok = await postScore(grp.code, post);
      if (!ok) saveRef.current = queueScore(saveRef.current, { ...post, groupCode: grp.code });
      else saveRef.current = clearQueued(saveRef.current, (x) => x.groupCode === grp.code && x.day === post.day);
    }
    writeFormationSave(saveRef.current);
  };
  const flushQueued = async () => {
    if (!apiBase() || !saveRef.current.pendingScores.length) return;
    const stillFailing: typeof saveRef.current.pendingScores = [];
    for (const x of saveRef.current.pendingScores) {
      const ok = await postScore(x.groupCode, { day: x.day, playerId: x.playerId, nick: x.nick, score: x.score, detailJson: x.detailJson });
      if (!ok) stillFailing.push(x);
    }
    saveRef.current = { ...saveRef.current, pendingScores: stillFailing };
    writeFormationSave(saveRef.current);
  };

  const finishDailyGame = () => {
    const g = gameRef.current!;
    const d = saveRef.current.daily!;
    saveRef.current = {
      ...saveRef.current,
      dailyGame: null,
      daily: finishDaily(d, { score: finalScore(g), quartersSolved: g.quartersSolved, perfects: g.perfects, turnovers: g.turnovers, day: d.day }),
    };
    setShared(false);
    setMode("chooser");
    setView("chooser");
    writeFormationSave(saveRef.current);
    bump();
    void submitDailyResult();
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
    if (!playing() || busyRef.current || game.over || !stage) return;
    setSheet(null);
    synth.ensure();
    lock(true);
    const r = call(game, side, abbr);
    if (r.correct) {
      saveRef.current = recordWallSolve(saveRef.current, game.sides[side].team, game.sides[side].wrongCalls === 0);
    }
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
    if (!playing() || busyRef.current) return; // a second thumb can't open a sheet mid-pull
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
    if (mode === "daily" && saveRef.current.published?.day === today) nextPublishedQuarter(g, saveRef.current.published);
    else nextQuarter(g, lineups, makeRng(g.seed + ":q" + (g.quarter + 1)));
    persist();
    bump();
  };
  const dailyStreak = saveRef.current.daily
    ? nextStreak(saveRef.current.daily.streak, saveRef.current.daily.lastPlayedDay, saveRef.current.daily.day)
    : 1;
  const onCreateGroup = async (name: string) => {
    const code = await createGroup(name);
    if (!code) return null;
    saveRef.current = ensurePlayer({ ...saveRef.current, groups: [...saveRef.current.groups.filter((g) => g.code !== code), { code, name }] });
    writeFormationSave(saveRef.current);
    bump();
    return code;
  };
  const onJoinGroup = async (code: string, nick: string) => {
    saveRef.current = ensurePlayer({ ...saveRef.current, nick, groups: saveRef.current.groups.some((g) => g.code === code) ? saveRef.current.groups : [...saveRef.current.groups, { code, name: code }] });
    writeFormationSave(saveRef.current);
    const ok = await joinGroup(code, saveRef.current.playerId, nick);
    if (ok) bump();
    return ok;
  };
  const openBoard = async () => {
    setSheet({ type: "board" });
    setBoard(null);
    setBoardLoading(true);
    void flushQueued();
    const first = saveRef.current.groups[0];
    const b = first ? await fetchBoard(first.code, today, saveRef.current.playerId) : null;
    setBoard(b);
    setBoardLoading(false);
  };

  const onShare = () => {
    const g = gameRef.current!;
    const d = saveRef.current.daily;
    if (!d) return;
    void copyText(shareLine({ score: finalScore(g), quartersSolved: g.quartersSolved, perfects: g.perfects, turnovers: g.turnovers, day: d.day }, dailyStreak)).then(setShared);
  };

  const onNewGame = () => {
    const finished = gameRef.current!;
    if (finished.over && finished.quarter >= 4) saveRef.current = recordFinishedGame(saveRef.current, finalScore(finished));
    seedRef.current = newSeed();
    gameRef.current = createGame(seedRef.current, lineups);
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
        {side === 1 && (
          <span className="fm-bar-chips">
            <button type="button" className="fm-tape" onClick={() => setSheet({ type: "tape" })}>TAPE</button>
            <button type="button" className="fm-tape" aria-label="WALL" onClick={() => setSheet({ type: "wall" })}>WALL</button>
          </span>
        )}
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
      {sheet?.type === "wall" && <WallSheet wall={saveRef.current.wall} onClose={close} />}
      {sheet?.type === "groups" && <GroupSheet save={saveRef.current} onCreate={onCreateGroup} onJoin={onJoinGroup} onClose={close} />}
      {sheet?.type === "board" && <BoardSheet board={board} today={today} loading={boardLoading} offline={!apiBase()} youNick={saveRef.current.nick} onClose={close} />}
      {view === "chooser" ? (
        <ModeSheet daily={saveRef.current.daily} today={today} resumableFree={!!saveRef.current.inProgress}
          onToday={() => void startMode("daily")} onFree={() => startMode("free")} onWall={() => setSheet({ type: "wall" })}
          onGroups={() => setSheet({ type: "groups" })} onBoard={() => void openBoard()} />
      ) : !sheet && !busy && g.over && (
        <OverSheet game={g} teams={teamMap} onNext={onNext} onNewGame={onNewGame} onBuy={(w) => { buyScheme(g, w); persist(); bump(); }}
          dailyFinal={mode === "daily" && g.quarter >= 4 && saveRef.current.daily ? { streak: dailyStreak, shared, onShare, onDone: finishDailyGame } : undefined} />
      )}
    </div>
  );
}
