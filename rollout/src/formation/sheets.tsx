import type { ReactNode } from "react";
import type { GameState, LogEntry, Play } from "./engine/game";
import { PEAK_QUARTER_PULLS, SCHEME_PRICES } from "./feel";
import { finalScore } from "./engine/game";
import type { TeamView } from "./teams";
import type { DailyState } from "./engine/daily";
import { shareLine } from "./share";

const SIDE = ["OFFENSE", "DEFENSE"] as const;

function Sheet({ title, onClose, children, className = "" }: { title: string; onClose?: () => void; children: ReactNode; className?: string }) {
  return (
    <>
      {onClose && <div className="fm-scrim" onClick={onClose} />}
      <div className={`fm-sheet ${className}`} role="dialog" aria-modal={onClose ? true : undefined} aria-label={title}>
        <div className="fm-sh-head">
          <span>{title}</span>
          {onClose && <button type="button" className="fm-x" onClick={onClose}>CLOSE</button>}
        </div>
        {children}
      </div>
    </>
  );
}

export function CallSheet({ game, side, teams, onPick, onClose }: {
  game: GameState; side: 0 | 1; teams: Map<string, TeamView>; onPick: (abbr: string) => void; onClose: () => void;
}) {
  const S = game.sides[side];
  const other = game.sides[1 - side];
  const all = [...teams.values()].sort((a, b) => a.abbr.localeCompare(b.abbr));
  return (
    <Sheet title={`CALL THE ${SIDE[side]}`} onClose={onClose}>
      <div className="fm-teams">
        {all.map((t) => {
          const dead = S.out.includes(t.abbr) || (other.solved && other.team === t.abbr);
          return (
            <button key={t.abbr} type="button" className="fm-team" data-testid={`pick-${t.abbr}`} disabled={dead}
              aria-label={t.full + (dead ? ", ruled out" : "")} style={{ ["--team" as string]: t.color } as React.CSSProperties}
              onClick={() => onPick(t.abbr)}>
              <b>{t.abbr}</b><small>{t.name}</small>
            </button>
          );
        })}
      </div>
      <p className="fm-note">A wrong call burns a down. {game.downs} left.</p>
    </Sheet>
  );
}

export function PeakSheet({ game, side, index, onPlay, onSpend, onLeave }: {
  game: GameState; side: 0 | 1; index: number; onPlay: () => void; onSpend: () => void; onLeave: () => void;
}) {
  const p = game.sides[side].lineup[index];
  return (
    <Sheet title={`PEAK · ${SIDE[side]} ${p.label}`} onClose={onLeave}>
      <p className="fm-note">One of the top 3 in the league at his spot. Who is it?</p>
      <button type="button" className="fm-opt" onClick={onPlay}><b>PLAY IT</b><small>Flip it: number and initials, right now.</small></button>
      <button type="button" className="fm-opt" onClick={onSpend}><b>SPEND IT</b><small>Use it on a play. This slot stays sealed.</small></button>
      <button type="button" className="fm-opt" onClick={onLeave}><b>LEAVE IT</b><small>It banks as a chip when the quarter ends.</small></button>
    </Sheet>
  );
}

export function PlaysSheet({ game, title, onPick, onClose }: { game: GameState; title: string; onPick: (play: Play) => void; onClose: () => void }) {
  const flagOk = game.sides[0].wrongCalls + game.sides[1].wrongCalls - game.flags > 0;
  return (
    <Sheet title={title} onClose={onClose}>
      <button type="button" className="fm-opt" disabled={game.noHuddle} onClick={() => onPick("nohuddle")}><b>NO-HUDDLE</b><small>Your next pull lands two slots and counts as one.</small></button>
      <button type="button" className="fm-opt" disabled={game.film} onClick={() => onPick("film")}><b>FILM STUDY</b><small>See the initials on any lit slot.</small></button>
      <button type="button" className="fm-opt" disabled={!flagOk} onClick={() => onPick("flag")}><b>CHALLENGE FLAG</b><small>{flagOk ? "Overturn a wrong call. Get the down back." : "Needs a wrong call this quarter."}</small></button>
    </Sheet>
  );
}

export function DetailSheet({ game, side, index, onClose }: { game: GameState; side: 0 | 1; index: number; onClose: () => void }) {
  const S = game.sides[side];
  const p = S.lineup[index];
  const s = S.slots[index];
  const known = S.solved || game.over !== null;
  const verdict = p.stamp === "P" ? "PEAK (top 3 at his spot)" : p.stamp === "C" ? "CHEEKS (bottom 3 at his spot)" : "MID";
  return (
    <Sheet title={`${SIDE[side]} · ${p.label}`} onClose={onClose}>
      <dl className="fm-detail">
        <dt>Number</dt><dd>#{p.jersey}</dd>
        <dt>Initials</dt><dd>{known || s.layer >= 2 ? p.ini : "pull deeper"}</dd>
        <dt>College</dt><dd>{known || s.layer >= 3 ? p.college : "pull deeper"}</dd>
        <dt>Verdict</dt><dd>{verdict}</dd>
      </dl>
    </Sheet>
  );
}

export function TapeSheet({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  return (
    <Sheet title="THE TAPE" onClose={onClose}>
      <ol className="fm-tapelist">
        {log.length === 0 && <li><span className="t">Nothing yet. Hold the card.</span></li>}
        {log.slice(0, 14).map((r, i) => (
          <li key={i} className={r.kind}><span className="n">{r.n || "–"}</span><span className="t">{r.text}</span></li>
        ))}
      </ol>
    </Sheet>
  );
}

export function ModeSheet({ daily, today, resumableFree, onToday, onFree, onWall }: {
  daily: DailyState | null; today: string; resumableFree: boolean;
  onToday: () => void; onFree: () => void; onWall: () => void;
}) {
  const done = daily && daily.day === today && daily.result;
  return (
    <Sheet title="FORMATION">
      {done ? (
        <>
          <p className="fm-note">Today's game is in the books — come back tomorrow.</p>
          <p className="fm-line">{shareLine(done, daily.streak)}</p>
          <p className="fm-note">🔥 {daily.streak}-day streak.</p>
        </>
      ) : (
        <p className="fm-note">Two teams are hiding. Name them in fewer pulls.</p>
      )}
      {!done && (
        <button type="button" className="fm-primary" onClick={onToday}>TODAY'S GAME{daily && daily.streak > 0 ? ` · 🔥${daily.streak + 1}` : ""}</button>
      )}
      <button type="button" className="fm-opt" onClick={onFree}><b>FREE PRACTICE</b><small>{resumableFree ? "Resume your game in progress." : "Unlimited random games. Fills the wall."}</small></button>
      <button type="button" className="fm-opt" onClick={onWall}><b>THE WALL</b><small>Every team you've ever named.</small></button>
    </Sheet>
  );
}

export function OverSheet({ game, teams, onNext, onNewGame, onBuy, dailyFinal }: {
  game: GameState; teams: Map<string, TeamView>; onNext: () => void; onNewGame: () => void; onBuy: (which: keyof typeof SCHEME_PRICES) => void;
  dailyFinal?: { streak: number; shared: boolean; onShare: () => void; onDone: () => void };
}) {
  const o = game.over!;
  const peakQ = o.kind === "solved" && o.score <= PEAK_QUARTER_PULLS;
  const head = o.kind === "turnover" ? "TURNOVER ON DOWNS" : peakQ ? "PEAK QUARTER" : `Q${game.quarter} FINAL`;
  const name = (abbr: string) => teams.get(abbr)?.full ?? abbr;
  const halftime = game.quarter === 2;
  return (
    <Sheet title={head} className={o.kind === "turnover" ? "over cheeksq" : peakQ ? "over peakq" : "over"}>
      <p className="fm-line">{o.kind === "turnover" ? `This quarter scores ${o.score}.` : `${o.score} spins.`}</p>
      <p className="fm-note">OFFENSE: {name(game.sides[0].team)} · DEFENSE: {name(game.sides[1].team)}</p>
      {o.banked > 0 && <p className="fm-note">+{o.banked} chip{o.banked > 1 ? "s" : ""} banked from face-down PEAKs.</p>}
      {game.perfects > 0 && <p className="fm-note">PERFECT releases this game: {game.perfects}</p>}
      {halftime && (
        <div className="fm-shop" aria-label="Halftime adjustments">
          <p className="fm-note">HALFTIME ADJUSTMENTS · ◆ {game.chips}</p>
          <button type="button" className="fm-opt" disabled={game.schemes.starPower || game.chips < SCHEME_PRICES.starPower} onClick={() => onBuy("starPower")}>
            <b>STAR POWER · ◆{SCHEME_PRICES.starPower}</b><small>{game.schemes.starPower ? "Owned. Runs through the second half." : "QB and defensive-star slots come up twice as often."}</small>
          </button>
          <button type="button" className="fm-opt" disabled={game.schemes.scouting || game.chips < SCHEME_PRICES.scouting} onClick={() => onBuy("scouting")}>
            <b>SCOUTING DEPT · ◆{SCHEME_PRICES.scouting}</b><small>{game.schemes.scouting ? "Owned. Runs through the second half." : "Each quarter starts with 3 teams that aren't playing crossed out."}</small>
          </button>
        </div>
      )}
      {game.quarter >= 4 ? (
        <>
          <p className="fm-final">FINAL: {game.total} spins − {game.chips} chips = <b>{finalScore(game)}</b></p>
          {dailyFinal ? (
            <>
              <p className="fm-note">🔥 {dailyFinal.streak}-day streak.</p>
              <button type="button" className="fm-opt" onClick={dailyFinal.onShare}>
                <b>{dailyFinal.shared ? "COPIED ✓" : "SHARE"}</b><small>The result line, ready for the group chat.</small>
              </button>
              <button type="button" className="fm-primary" onClick={dailyFinal.onDone}>DONE</button>
            </>
          ) : (
            <button type="button" className="fm-primary" onClick={onNewGame}>NEW GAME</button>
          )}
        </>
      ) : (
        <button type="button" className="fm-primary" onClick={onNext}>NEXT QUARTER</button>
      )}
    </Sheet>
  );
}
