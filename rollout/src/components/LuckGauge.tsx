import { memo } from "react";
import type { SourceStats } from "@/storage/storage";
import { luckIndex, luckTitle } from "@/engine/luck";
import "./LuckGauge.css";

// The Cheeks Gauge: you vs what fate owed you. Needle swings on its own via
// CSS transition whenever the reading changes (i.e., after every verdict).
function LuckGaugeBase({ stats }: { stats: SourceStats }) {
  const { L } = luckIndex(stats);
  const title = luckTitle(L, stats.pulls);
  // BLESSED is the gold LEFT end; angle = -L/3 × 78°
  const angle = L === null ? 0 : -(L / 3) * 78;
  const owed = (v: number) => Math.round(v * 10) / 10;
  return (
    <div className="luck-gauge" data-testid="luck-gauge" data-luck={L ?? "pending"}>
      <div className="gauge-dial">
        <div className="gauge-arc" />
        <div className="gauge-needle" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="gauge-hub" />
        <span className="gauge-end gold">BLESSED</span>
        <span className="gauge-mid">FATE</span>
        <span className="gauge-end brown">CURSED</span>
      </div>
      <div className={`gauge-title ${L === null ? "pending" : L >= 0.75 ? "blessed" : L <= -0.75 ? "cursed" : ""}`}>
        {title}
      </div>
      <div className="gauge-fine">
        peaks {stats.peaks} / owed {owed(stats.peaksExp)} · cheeks {stats.cheeks} / owed {owed(stats.cheeksExp)}
      </div>
    </div>
  );
}

export const LuckGauge = memo(LuckGaugeBase);
