import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, type MarketViewDto } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useUiStore } from '@shared/store/uiStore';
import { MatchupHeader, OutcomeBar, MarketStatusBadge, PageHeader, StatePanel, formatPool } from '@xcup/components/cup/CupKit';
import { cn } from '@shared/utils/format';

type Filter = 'all' | 'upcoming' | 'live' | 'finished';
type TypeFilter = 'all' | '1X2' | 'OU25' | 'BTTS';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'live', label: 'Live' },
  { id: 'finished', label: 'Finished' },
];

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: '1X2', label: 'Match Result' },
  { id: 'OU25', label: 'Over/Under 2.5' },
  { id: 'BTTS', label: 'Both Score' },
];

const TYPE_SHORT: Record<string, string> = {
  '1X2': 'Match Result',
  OU25: 'O/U 2.5',
  BTTS: 'Both Score',
};

export function MarketsPage() {
  const { data, loading, error, reload } = useApi(() => api.markets(), []);
  const openMarket = useUiStore((s) => s.openMarket);
  const [filter, setFilter] = useState<Filter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const markets = useMemo(() => data?.markets ?? [], [data]);
  const filtered = useMemo(
    () =>
      markets.filter((m) => {
        if (typeFilter !== 'all' && m.marketType !== typeFilter) return false;
        if (filter === 'live') return m.matchStatus === 'live';
        if (filter === 'finished') return m.matchStatus === 'final' || m.matchStatus === 'settled';
        if (filter === 'upcoming') return m.matchStatus === 'scheduled';
        return true;
      }),
    [markets, filter, typeFilter],
  );

  // Cap the initial render — 104 World Cup fixtures × 3 market types is 300+ cards.
  const PAGE = 36;
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [filter, typeFilter]);
  const shown = filtered.slice(0, visible);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        kicker="World Cup 2026 · X Layer"
        title="Match Markets"
        sub="Real-money pari-mutuel pools on football outcomes — settled by a bonded multi-source oracle."
        action={
          data?.contract.address ? (
            <span className="hidden rounded-lg border border-pitch-border bg-pitch-bg px-3 py-1.5 text-xs font-bold text-pitch md:block">
              Pool contract live
            </span>
          ) : undefined
        }
      />

      <div className="mb-3 flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors',
              filter === f.id
                ? 'bg-pitch text-stadium-base'
                : 'border border-stadium-line text-stadium-text-secondary hover:text-stadium-text',
            )}
          >
            {f.label}
          </button>
        ))}
        {!loading && !error && (
          <span className="ml-auto text-xs tabular text-stadium-text-muted">{filtered.length} markets</span>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
              typeFilter === t.id
                ? 'bg-gold text-stadium-base'
                : 'border border-stadium-line text-stadium-text-secondary hover:text-stadium-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <StatePanel
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel="No fixtures in this filter yet"
        onRetry={reload}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => (
            <MarketCard key={m.id} market={m} onOpen={() => openMarket(m.id)} />
          ))}
        </div>
        {filtered.length > visible && (
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="mx-auto mt-5 block rounded-full border border-stadium-line px-5 py-2 text-xs font-bold text-stadium-text-secondary transition-colors hover:border-stadium-line-strong hover:text-stadium-text"
          >
            Load more · {filtered.length - visible} left
          </button>
        )}
      </StatePanel>
    </div>
  );
}

function MarketCard({ market, onOpen }: { market: MarketViewDto; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="stadium-card stadium-card-hover group flex flex-col gap-3.5 p-4 text-left">
      <div className="flex items-center justify-between">
        <span className="truncate text-[11px] font-semibold text-stadium-text-muted">{market.stage}</span>
        <MarketStatusBadge status={market.marketStatus} />
      </div>

      <MatchupHeader home={market.home} away={market.away} kickoffUtc={market.kickoffUtc} />

      <span className="-mt-1 w-fit rounded-md border border-stadium-line bg-stadium-base px-2 py-0.5 text-[10px] font-bold text-gold">
        {TYPE_SHORT[market.marketType] ?? market.marketType}
      </span>

      <OutcomeBar
        odds={market.impliedOdds}
        winningOutcome={market.winningOutcome}
        outcomeLabels={market.outcomeLabels}
      />

      <div className="flex items-center justify-between border-t border-stadium-line pt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">Pool</div>
          <div className="font-mono text-sm font-semibold text-stadium-text">{formatPool(market.pools.total)}</div>
        </div>
        <span className="flex items-center gap-1 text-xs font-bold text-pitch opacity-0 transition-opacity group-hover:opacity-100">
          Predict <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}
