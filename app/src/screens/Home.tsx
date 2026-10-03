import type { SaveState } from "@/storage/storage";
import { canClaimDaily } from "@/engine/economy";

export function Home({ save, goPacks }: {
  save: SaveState; goPacks: () => void; }) {
  const today = new Date().toISOString().slice(0, 10);
  const claimable = canClaimDaily(save.lastDailyClaim, today);
  return (
    <section className="home">
      <h2>Streak: {save.streak} 🔥</h2>
      <p>Cards owned: {Object.keys(save.owned).length}</p>
      <button data-testid="go-packs" onClick={goPacks}>
        {claimable ? "Claim your FREE daily pack →" : "Open Packs"}</button>
    </section>
  );
}
