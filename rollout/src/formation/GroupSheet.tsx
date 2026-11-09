import { useState } from "react";
import type { FormationSave } from "./store";
import type { Board } from "./api";
import { apiBase } from "./api";

const CODE_RE = /^[A-Z2-9]{6}$/;

/** Create a group or join with a code + your nickname. No accounts — the phone is the identity. */
export function GroupSheet({ save, onCreate, onJoin, onClose }: {
  save: FormationSave;
  onCreate: (name: string) => Promise<string | null>;
  onJoin: (code: string, nick: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"join" | "create">(save.groups.length ? "join" : "create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [nick, setNick] = useState(save.nick);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setErr("");
    if (nick.trim().length < 2) { setErr("Nickname needs 2+ characters."); return; }
    setBusy(true);
    const ok = tab === "create" ? (await onCreate(name.trim())) !== null : CODE_RE.test(code.trim().toUpperCase()) && await onJoin(code.trim().toUpperCase(), nick.trim());
    setBusy(false);
    if (!ok) setErr(tab === "create" ? "Couldn't reach the house. Try again." : "That code didn't work. Check it and retry.");
  };

  return (
    <>
      <div className="fm-scrim" onClick={onClose} />
      <div className="fm-sheet" role="dialog" aria-modal="true" aria-label="GROUPS">
        <div className="fm-sh-head"><span>THE GROUP</span><button type="button" className="fm-x" onClick={onClose}>CLOSE</button></div>
        {!apiBase() && <p className="fm-note">The board isn't connected yet. Groups arrive with the house's server.</p>}
        {save.groups.length > 0 && (
          <div>
            {save.groups.map((g) => <p key={g.code} className="fm-note">{g.name} · <b>{g.code}</b></p>)}
          </div>
        )}
        <div className="fm-shop">
          <label className="fm-note" htmlFor="fm-nick">NICKNAME</label>
          <input id="fm-nick" className="fm-input" value={nick} maxLength={12} placeholder="AARON" onChange={(e) => setNick(e.target.value)} />
          <div className="fm-tabs">
            <button type="button" className={tab === "join" ? "on" : ""} onClick={() => setTab("join")}>JOIN</button>
            <button type="button" className={tab === "create" ? "on" : ""} onClick={() => setTab("create")}>CREATE</button>
          </div>
          {tab === "join" ? (
            <>
              <label className="fm-note" htmlFor="fm-code">GROUP CODE</label>
              <input id="fm-code" className="fm-input" value={code} maxLength={6} placeholder="BLTZ7K"
                onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </>
          ) : (
            <>
              <label className="fm-note" htmlFor="fm-gname">GROUP NAME</label>
              <input id="fm-gname" className="fm-input" value={name} maxLength={24} placeholder="the boys" onChange={(e) => setName(e.target.value)} />
            </>
          )}
          {err && <p className="fm-note" role="alert">{err}</p>}
          <button type="button" className="fm-primary" disabled={busy || !apiBase()} onClick={() => void go()}>
            {busy ? "..." : tab === "join" ? "JOIN THE GROUP" : "CREATE THE GROUP"}
          </button>
        </div>
      </div>
    </>
  );
}

/** Today's standings. Rows stay blurred until you've played today — no spoilers. */
export function BoardSheet({ board, today, loading, offline, onClose, youNick }: {
  board: Board | null; today: string; loading: boolean; offline: boolean; youNick: string; onClose: () => void;
}) {
  return (
    <>
      <div className="fm-scrim" onClick={onClose} />
      <div className="fm-sheet" role="dialog" aria-modal="true" aria-label="THE BOARD">
        <div className="fm-sh-head"><span>THE BOARD · {today.slice(5)}</span><button type="button" className="fm-x" onClick={onClose}>CLOSE</button></div>
        {offline && <p className="fm-note">Can't reach the house. Scores post when it's back.</p>}
        {loading && <p className="fm-note">Fetching the tape…</p>}
        {board && (board.youPlayed ? (
          <ol className="fm-boardlist">
            {board.rows.map((r, i) => (
              <li key={r.playerId + i} className={r.nick === youNick ? "you" : ""}>
                <span className="pos">{i + 1}</span>
                <span className="nick">{r.nick}</span>
                <span className="score">{r.score}</span>
              </li>
            ))}
            {board.rows.length === 0 && <li><span className="nick">Nobody has finished today. Be first.</span></li>}
          </ol>
        ) : (
          <div>
            <p className="fm-note">{board.rows.length} friend{board.rows.length === 1 ? "" : "s"} played today.</p>
            <p className="fm-note">Play today's game first — no spoilers on the house's watch.</p>
          </div>
        ))}
      </div>
    </>
  );
}
