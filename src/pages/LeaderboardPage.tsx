import { Crown, Bot, User } from 'lucide-react';
import { api } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useWalletStore } from '@shared/store/walletStore';
import { useUiStore } from '@shared/store/uiStore';
import { PageHeader, StatePanel } from '@xcup/components/cup/CupKit';
import { explorerAddress } from '@shared/config/links';
import { cn } from '@shared/utils/format';
import { useState } from 'react';
import { LeaguesPanel } from '@xcup/components/cup/LeaguesPanel';

function shortWallet(w: string): string {
  return w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function LeaderboardPage() {
  const { connected, address } = useWalletStore();
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const { data, loading, error, reload } = useApi(() => api.cupLeaderboard(), []);
  const [view, setView] = useState<'global' | 'leagues'>('global');

  const rows = data?.rows ?? [];
  const hermes = data?.hermes ?? null;
  const you =
    connected && address ? rows.find((r) => r.wallet.toLowerCase() === address.toLowerCase()) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        kicker="Beat the bots"
        title="Leaderboard"
        sub="Global ranking by free-pool pick accuracy — you against every fan and the AI pundit."
      />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setView('global')}
          className={cn(
            'rounded-xl px-4 py-1.5 text-sm font-bold',
            view === 'global'
              ? 'bg-pitch text-stadium-base'
              : 'border border-stadium-line text-stadium-text-secondary',
          )}
        >
          Global
        </button>
        <button
          onClick={() => setView('leagues')}
          className={cn(
            'rounded-xl px-4 py-1.5 text-sm font-bold',
            view === 'leagues'
              ? 'bg-pitch text-stadium-base'
              : 'border border-stadium-line text-stadium-text-secondary',
          )}
        >
          My Leagues
        </button>
      </div>

      {view === 'leagues' ? (
        <LeaguesPanel />
      ) : (
        <>
          <div className="stadium-card pitch-stripes mb-4 p-5">
            <div className="mb-4 flex items-center gap-2 text-micro text-pitch">
              <Crown className="h-3.5 w-3.5" /> You vs Hermes
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-stadium-line bg-stadium-base p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-pitch-bg">
                    <User className="h-4 w-4 text-pitch" />
                  </div>
                  <span className="text-sm font-bold text-stadium-text">
                    {you ? `#${you.rank}` : connected ? 'You' : 'Connect wallet'}
                  </span>
                </div>
                <div className="font-display text-3xl text-pitch">{you ? pct(you.accuracy) : '—'}</div>
                <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">
                  {you ? `${you.correct}/${you.picks} correct · ${you.points} pts` : 'no scored picks yet'}
                </div>
              </div>
              <div className="rounded-xl border border-gold-border bg-gold-bg p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-stadium-base">
                    <Bot className="h-4 w-4 text-gold" />
                  </div>
                  <span className="text-sm font-bold text-stadium-text">
                    Hermes{hermes ? ` · #${hermes.rank}` : ''}
                  </span>
                </div>
                <div className="font-display text-3xl text-gold">{hermes ? pct(hermes.accuracy) : 'AI'}</div>
                <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">
                  {hermes ? `${hermes.correct}/${hermes.picks} correct · ${hermes.points} pts` : 'autonomous pundit'}
                </div>
              </div>
            </div>
          </div>

          <StatePanel
            loading={loading}
            error={error}
            empty={rows.length === 0}
            emptyLabel="Global ranking opens at the first settlement"
            emptyAction={{ label: 'Make a free pick', onClick: () => setActiveTab('markets') }}
            onRetry={reload}
          >
            <div className="stadium-card divide-y divide-stadium-line">
              {rows.map((r) => (
                <div
                  key={r.wallet}
                  className={cn(
                    'flex items-center gap-3 p-3.5',
                    you && r.wallet.toLowerCase() === you.wallet.toLowerCase() && 'bg-pitch-bg',
                  )}
                >
                  <span className="font-display w-8 text-center text-lg text-stadium-text-muted">{r.rank}</span>
                  <div className="flex items-center gap-2">
                    {r.isHermes ? (
                      <Bot className="h-4 w-4 text-gold" />
                    ) : (
                      <User className="h-4 w-4 text-stadium-text-muted" />
                    )}
                    {r.isHermes ? (
                      <span className="font-mono text-xs text-stadium-text">Hermes</span>
                    ) : (
                      <a
                        href={explorerAddress(r.wallet)}
                        target="_blank"
                        rel="noreferrer"
                        title={`View ${r.wallet} on X Layer explorer`}
                        className="font-mono text-xs text-stadium-text hover:text-pitch hover:underline"
                      >
                        {shortWallet(r.wallet)}
                      </a>
                    )}
                  </div>
                  <span className="ml-auto font-mono text-sm font-bold text-pitch">{pct(r.accuracy)}</span>
                  <span className="w-20 text-right font-mono text-xs text-stadium-text-secondary">
                    {r.correct}/{r.picks}
                  </span>
                  <span className="w-16 text-right font-mono text-xs font-bold text-gold">{r.points} pts</span>
                </div>
              ))}
            </div>
          </StatePanel>
        </>
      )}
    </div>
  );
}
