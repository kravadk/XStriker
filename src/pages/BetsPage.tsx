import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { api, type MarketPositionDto, type MarketViewDto } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useWalletStore } from '@shared/store/walletStore';
import { useUiStore } from '@shared/store/uiStore';
import { toast } from '@shared/store/toastStore';
import { celebrate } from '@shared/store/celebrateStore';
import { useRetryUntil } from '@shared/hooks/useRetryUntil';
import { MatchupHeader, PageHeader, StatePanel, fromBaseUnits } from '@xcup/components/cup/CupKit';
import { cn } from '@shared/utils/format';

type Position = MarketPositionDto & { market: MarketViewDto };

const STATUS: Record<MarketPositionDto['status'], { label: string; cls: string }> = {
  contract_not_deployed: { label: 'Pending', cls: 'text-stadium-text-muted' },
  no_position: { label: '—', cls: 'text-stadium-text-muted' },
  open: { label: 'Open', cls: 'text-pitch' },
  pending_settlement: { label: 'Awaiting result', cls: 'text-gold' },
  won_claimable: { label: 'Won — claim', cls: 'text-outcome-win' },
  won_claimed: { label: 'Won — claimed', cls: 'text-stadium-text-secondary' },
  lost: { label: 'Lost', cls: 'text-outcome-loss' },
  refund_claimable: { label: 'Refund — claim', cls: 'text-outcome-away' },
  refunded: { label: 'Refunded', cls: 'text-stadium-text-secondary' },
};

export function BetsPage() {
  const { connected, address, sendTx } = useWalletStore();
  const openMarket = useUiStore((s) => s.openMarket);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const setConnectModalOpen = useUiStore((s) => s.setConnectModalOpen);
  const recentStakeAt = useUiStore((s) => s.recentStakeAt);
  const { data, loading, error, reload } = useApi(
    () => (connected && address ? api.marketPositions(address) : Promise.resolve({ wallet: '', positions: [] })),
    [connected, address],
  );
  const [claiming, setClaiming] = useState<string | null>(null);

  const positions = data?.positions ?? [];

  // When a fresh stake just landed (signal from MarketDetailPage), retry the
  // position fetch a few times so the user does not see "No bets yet" while
  // the backend indexer is still 5-15s behind the chain.
  useRetryUntil(
    recentStakeAt,
    () => reload(),
    () => (data?.positions?.length ?? 0) > 0,
  );

  async function claim(p: Position) {
    setClaiming(p.market.id);
    try {
      const { claimTx } = await api.marketClaimTx(p.market.id);
      const hash = await sendTx(claimTx);
      toast.success(`Claim submitted · ${hash.slice(0, 10)}…`);
      // Winning claims earn a celebration; a refund claim is just settled funds.
      if (p.status === 'won_claimable') celebrate();
      // Keep the button busy until the refreshed position is in.
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Claim failed');
    } finally {
      setClaiming(null);
    }
  }

  if (!connected) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader kicker="Your positions" title="My Bets" />
        <div className="stadium-card flex flex-col items-center gap-3 p-12 text-center">
          <Wallet className="h-7 w-7 text-pitch" />
          <div className="text-sm font-semibold text-stadium-text">Connect your wallet to see your bets</div>
          <button
            onClick={() => setConnectModalOpen(true)}
            className="rounded-xl bg-pitch px-5 py-2 text-sm font-bold text-stadium-base hover:bg-pitch-bright glow-pitch"
          >
            Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        kicker="Your positions"
        title="My Bets"
        sub="Stakes, settlement status and claimable winnings — read from the chain."
      />
      <StatePanel
        loading={loading}
        error={error}
        empty={positions.length === 0}
        emptyLabel="No bets yet — stake on a market to get started"
        emptyAction={{ label: 'Browse markets', onClick: () => setActiveTab('markets') }}
        onRetry={reload}
      >
        <div className="flex flex-col gap-3">
          {positions.map((p) => {
            const meta = STATUS[p.status];
            const staked = fromBaseUnits(p.stake.home) + fromBaseUnits(p.stake.draw) + fromBaseUnits(p.stake.away);
            const claimable = fromBaseUnits(p.claimableEstimate);
            const canClaim = p.status === 'won_claimable' || p.status === 'refund_claimable';
            return (
              <div key={p.market.id} className="stadium-card p-4">
                <button onClick={() => openMarket(p.market.id)} className="w-full text-left">
                  <MatchupHeader home={p.market.home} away={p.market.away} size="sm" kickoffUtc={p.market.kickoffUtc} />
                </button>
                <div className="mt-3 flex items-center justify-between border-t border-stadium-line pt-3">
                  <div className="flex gap-5 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">Staked</div>
                      <div className="font-mono font-semibold text-stadium-text">{staked.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">Status</div>
                      <div className={cn('font-semibold', meta.cls)}>{meta.label}</div>
                    </div>
                    {claimable > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">Claimable</div>
                        <div className="font-mono font-semibold text-outcome-win">{claimable.toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                  {canClaim && (
                    <button
                      onClick={() => void claim(p)}
                      disabled={claiming === p.market.id}
                      className="rounded-lg bg-pitch px-4 py-2 text-xs font-bold text-stadium-base hover:bg-pitch-bright disabled:opacity-50"
                    >
                      {claiming === p.market.id ? 'Claiming…' : `Claim ${claimable.toFixed(2)}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </StatePanel>
    </div>
  );
}
