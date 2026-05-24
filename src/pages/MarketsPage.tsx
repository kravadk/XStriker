import { useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api, type MarketViewDto, type FanScoreDto } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useUiStore } from '@shared/store/uiStore';
import { useWalletStore } from '@shared/store/walletStore';
import { SegmentedTabs } from '@shared/common/SegmentedTabs';
import { StatePanel } from '@xcup/components/cup/CupKit';
import { FixtureCard } from '@xcup/components/cup/FixtureCard';
import { XCupHero } from '@xcup/components/cup/XCupHero';
import { XCupTierRing } from '@xcup/components/cup/XCupTierRing';
import { XCupMiniWidget } from '@xcup/components/cup/XCupMiniWidget';
import { cn } from '@shared/utils/format';

type Filter = 'all' | 'upcoming' | 'live' | 'finished';
type TypeFilter = 'all' | '1X2' | 'OU25' | 'BTTS';

const FILTER_TABS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All markets' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'live', label: 'Live now' },
  { id: 'finished', label: 'Finished' },
];

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: '1X2', label: 'Match Result' },
  { id: 'OU25', label: 'Over/Under 2.5' },
  { id: 'BTTS', label: 'Both Score' },
];

function parsePool(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Group market entries by their `matchId` so each fixture is rendered once
 * with all its market types inside (Match Result / O/U 2.5 / Both Score).
 * Preserves the input ordering of the first market seen per fixture.
 */
function groupByFixture(
  markets: MarketViewDto[],
): Array<{ fixture: MarketViewDto; markets: MarketViewDto[] }> {
  const order: string[] = [];
  const buckets = new Map<string, MarketViewDto[]>();
  for (const m of markets) {
    if (!buckets.has(m.matchId)) {
      order.push(m.matchId);
      buckets.set(m.matchId, []);
    }
    buckets.get(m.matchId)!.push(m);
  }
  return order.map((id) => {
    const list = buckets.get(id)!;
    return { fixture: list[0], markets: list };
  });
}

export function MarketsPage() {
  const { data, loading, error, reload } = useApi(() => api.markets(), []);
  const openMarket = useUiStore((s) => s.openMarket);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const setConnectModalOpen = useUiStore((s) => s.setConnectModalOpen);
  const { connected, address } = useWalletStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [fanScore, setFanScore] = useState<FanScoreDto | null>(null);

  const markets = useMemo(() => data?.markets ?? [], [data]);

  useEffect(() => {
    if (!connected || !address) {
      setFanScore(null);
      return;
    }
    api.cupFanScore(address).then(setFanScore).catch(() => setFanScore(null));
  }, [connected, address]);

  const liveCount = useMemo(() => markets.filter((m) => m.matchStatus === 'live').length, [markets]);
  const upcomingCount = useMemo(() => markets.filter((m) => m.matchStatus === 'scheduled').length, [markets]);
  const totalPoolUsd = useMemo(() => {
    const sum = markets.reduce((acc, m) => acc + parsePool(m.pools.total), 0);
    return sum / 1_000_000;
  }, [markets]);
  const poolSeries = useMemo(() => {
    const sorted = [...markets].sort((a, b) => parsePool(b.pools.total) - parsePool(a.pools.total)).slice(0, 10);
    return sorted.map((m) => parsePool(m.pools.total) / 1_000_000);
  }, [markets]);

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

  const fixtures = useMemo(() => groupByFixture(filtered), [filtered]);
  const uniqueMatchCount = useMemo(
    () => new Set(markets.map((m) => m.matchId)).size,
    [markets],
  );

  const PAGE = 24;
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [filter, typeFilter]);
  const shownFixtures = fixtures.slice(0, visible);
  const totalShownMarkets = shownFixtures.reduce((acc, f) => acc + f.markets.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-1">
      {/* === HERO BAND ============================================== */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8">
          <XCupHero liveCount={liveCount} fixtureCount={uniqueMatchCount} marketCount={markets.length} />
        </div>
        <div className="md:col-span-4">
          <div className="stadium-card relative overflow-hidden p-6 h-full flex flex-col items-center justify-center text-center">
            <div className="text-gold text-[10px] tracking-[0.2em] uppercase font-bold mb-2">Your FanPass</div>
            {!connected ? (
              <>
                <XCupTierRing score={0} tierLabel="UNKNOWN" size={160} />
                <button
                  onClick={() => setConnectModalOpen(true)}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl btn-premium-gold px-5 py-2.5 text-sm"
                >
                  <Wallet className="h-4 w-4" /> Connect wallet
                </button>
              </>
            ) : !fanScore ? (
              <div className="py-10 text-xs text-stadium-text-muted">computing your score…</div>
            ) : (
              <>
                <XCupTierRing score={fanScore.score} tierLabel={fanScore.level.toUpperCase()} size={160} />
                <div className="mt-3 text-[10px] text-stadium-text-muted">
                  {fanScore.gates.length > 0 ? fanScore.gates[0] : fanScore.verdict.slice(0, 60)}
                </div>
                <button
                  onClick={() => setActiveTab('fanpass')}
                  className="mt-3 text-[11px] text-gold hover:underline font-bold"
                >
                  See breakdown →
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* === MINI-WIDGET ROW ======================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <XCupMiniWidget
          variant="live"
          label="Live now"
          value={liveCount}
          footer={liveCount > 0 ? 'matches in play' : 'next slot soon'}
          loading={loading}
        />
        <XCupMiniWidget
          variant="pool"
          label="Total pool"
          value={totalPoolUsd}
          prefix="$"
          series={poolSeries}
          loading={loading}
        />
        <XCupMiniWidget
          variant="bracket"
          label="Bracket"
          value={uniqueMatchCount}
          footer="indexed fixtures"
          loading={loading}
        />
        <XCupMiniWidget
          variant="fanpass"
          label={connected && fanScore ? `${fanScore.level} tier` : 'FanPass · join'}
          value={fanScore?.score ?? 0}
          footer={connected ? 'see breakdown' : 'connect to mint'}
          loading={connected && !fanScore}
        />
      </div>

      {/* === SEGMENTED TABS (status filter) ========================= */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="overflow-x-auto scrollbar-hide">
          <SegmentedTabs<Filter>
            value={filter}
            items={FILTER_TABS}
            onChange={setFilter}
            className="!bg-stadium-card !border-stadium-line"
          />
        </div>
        {!loading && !error && (
          <span className="text-xs tabular text-stadium-text-muted">
            {fixtures.length} {fixtures.length === 1 ? 'fixture' : 'fixtures'}
            <span className="opacity-70"> · {totalShownMarkets} markets</span>
          </span>
        )}
      </div>

      {/* === Market-type chip row =================================== */}
      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
              typeFilter === t.id
                ? 'bg-gold text-stadium-base shadow-[0_0_12px_rgba(231,184,79,0.35)]'
                : 'border border-stadium-line text-stadium-text-secondary hover:text-stadium-text',
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-stadium-text-muted">{upcomingCount} upcoming</span>
      </div>

      {/* === Markets grid =========================================== */}
      <StatePanel
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel="No fixtures in this filter yet"
        onRetry={reload}
      >
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {shownFixtures.map(({ fixture, markets: fxMarkets }) => (
            <FixtureCard
              key={fixture.matchId}
              fixture={fixture}
              markets={fxMarkets}
              onOpenMarket={openMarket}
            />
          ))}
        </div>
        {fixtures.length > visible && (
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="mx-auto mt-5 block rounded-full border border-stadium-line px-5 py-2 text-xs font-bold text-stadium-text-secondary transition-colors hover:border-stadium-line-strong hover:text-stadium-text"
          >
            Load more · {fixtures.length - visible} fixtures left
          </button>
        )}
      </StatePanel>
    </div>
  );
}
