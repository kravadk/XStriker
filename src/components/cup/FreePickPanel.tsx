import { useState } from 'react';
import { Gift } from 'lucide-react';
import { api } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useWalletStore } from '@shared/store/walletStore';
import { useUiStore } from '@shared/store/uiStore';
import { toast } from '@shared/store/toastStore';
import { cn } from '@shared/utils/format';

const OUTCOMES = [
  { id: 'HOME', label: 'Home' },
  { id: 'DRAW', label: 'Draw' },
  { id: 'AWAY', label: 'Away' },
] as const;

/**
 * Free-to-play pick panel — records a no-money outcome call for the fixture. While the
 * fixture is still open the pick can be changed; once it locks the result is shown.
 */
export function FreePickPanel({ matchId, locked }: { matchId: string; locked: boolean }) {
  const { connected, address } = useWalletStore();
  const setConnectModalOpen = useUiStore((s) => s.setConnectModalOpen);
  const { data, reload } = useApi(
    () => (connected && address ? api.freePicks({ wallet: address, matchId }) : Promise.resolve({ picks: [] })),
    [connected, address, matchId],
  );
  const myPick = data?.picks[0] ?? null;
  const [choice, setChoice] = useState<'HOME' | 'DRAW' | 'AWAY' | null>(null);
  const [busy, setBusy] = useState(false);

  // The active selection: an explicit choice, otherwise the wallet's existing pick.
  const selected = choice ?? myPick?.outcome ?? null;

  async function submit() {
    if (!address || !selected) return;
    setBusy(true);
    try {
      await api.makeFreePick(matchId, address, selected);
      toast.success(myPick ? 'Free pick updated' : 'Free pick recorded');
      setChoice(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Free pick failed');
    } finally {
      setBusy(false);
    }
  }

  const pickResult = myPick ? (
    <div className="text-xs text-stadium-text-secondary">
      Your free pick: <span className="font-bold text-stadium-text">{myPick.outcome}</span>
      {myPick.resolvedCorrect === null
        ? ' · pending result'
        : myPick.resolvedCorrect
          ? ` · correct +${myPick.points} pts`
          : ' · missed'}
    </div>
  ) : null;

  return (
    <div className="stadium-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="h-4 w-4 text-gold" />
        <span className="text-sm font-bold text-stadium-text">Free pick — no stake</span>
        <span className="ml-auto text-[10px] text-stadium-text-muted">earns points, not USDC</span>
      </div>

      {locked ? (
        pickResult ?? (
          <div className="text-xs text-stadium-text-secondary">Free picks are closed for this fixture.</div>
        )
      ) : !connected ? (
        <button
          onClick={() => setConnectModalOpen(true)}
          className="w-full rounded-xl border border-stadium-line-strong py-2 text-sm font-bold text-stadium-text hover:bg-[rgba(255,255,255,0.05)]"
        >
          Connect wallet to make a free pick
        </button>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                onClick={() => setChoice(o.id)}
                className={cn(
                  'rounded-xl border p-2 text-sm font-bold transition-all',
                  selected === o.id
                    ? 'border-pitch bg-pitch-bg text-stadium-text'
                    : 'border-stadium-line text-stadium-text-secondary hover:border-stadium-line-strong',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void submit()}
            disabled={busy || !selected || selected === myPick?.outcome}
            className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-stadium-base hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Recording…' : myPick ? 'Update free pick' : 'Make free pick'}
          </button>
          {pickResult && <div className="mt-2">{pickResult}</div>}
        </>
      )}
    </div>
  );
}
