import { ArrowRight, Goal, BarChart3, Target } from 'lucide-react';
import type { MarketViewDto } from '@shared/api/client';
import { MatchupHeader, OutcomeBar, MarketStatusBadge, formatPool } from './CupKit';

interface Props {
  /** Fixture-level data (use any market — matchup/kickoff are identical) */
  fixture: MarketViewDto;
  /** All markets that belong to this fixture (1..3 entries) */
  markets: MarketViewDto[];
  onOpenMarket: (marketId: string) => void;
}

const TYPE_META: Record<string, { label: string; icon: typeof Goal; color: string; bg: string }> = {
  '1X2': {
    label: 'Match Result',
    icon: Goal,
    color: '#34C172',
    bg: 'rgba(52,193,114,0.10)',
  },
  OU25: {
    label: 'Over / Under 2.5',
    icon: BarChart3,
    color: '#4AA8E0',
    bg: 'rgba(74,168,224,0.10)',
  },
  BTTS: {
    label: 'Both Score',
    icon: Target,
    color: '#E7B84F',
    bg: 'rgba(231,184,79,0.10)',
  },
};

export function FixtureCard({ fixture, markets, onOpenMarket }: Props) {
  return (
    <div className="stadium-card flex flex-col overflow-hidden">
      {/* Fixture header — rendered once for all markets in this fixture */}
      <div className="flex flex-col gap-3 p-5 border-b border-stadium-line">
        <div className="flex items-center justify-between">
          <span className="truncate text-[11px] font-semibold text-stadium-text-muted">
            {fixture.stage}
          </span>
          <MarketStatusBadge status={fixture.marketStatus} />
        </div>
        <MatchupHeader
          home={fixture.home}
          away={fixture.away}
          kickoffUtc={fixture.kickoffUtc}
          size="lg"
        />
        {fixture.venue && (
          <div className="text-[11px] text-stadium-text-muted truncate">{fixture.venue}</div>
        )}
      </div>

      {/* Per-market rows */}
      <div className="flex flex-col divide-y divide-stadium-line">
        {markets.map((m) => {
          const meta = TYPE_META[m.marketType] ?? {
            label: m.marketType,
            icon: Goal,
            color: '#9DA89C',
            bg: 'rgba(255,255,255,0.04)',
          };
          const Icon = meta.icon;
          return (
            <button
              key={m.id}
              onClick={() => onOpenMarket(m.id)}
              className="group flex flex-col gap-2 px-5 py-3.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
                  style={{
                    background: meta.bg,
                    border: `1px solid ${meta.color}40`,
                    boxShadow: `0 0 8px ${meta.color}22`,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                </div>
                <span className="font-display text-[13px] font-bold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <div className="flex-1" />
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">
                    Pool
                  </div>
                  <div className="font-mono text-sm font-semibold text-stadium-text">
                    {formatPool(m.pools.total)}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-stadium-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <OutcomeBar
                odds={m.impliedOdds}
                winningOutcome={m.winningOutcome}
                outcomeLabels={m.outcomeLabels}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
