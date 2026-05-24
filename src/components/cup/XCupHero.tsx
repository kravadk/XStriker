import { Trophy } from 'lucide-react';
import { HexGrid } from '@shared/common/HexGrid';

interface Props {
  /** Optional number of markets live right now, shown on a status chip */
  liveCount?: number;
  /** Distinct fixtures (matches) currently indexed from ParimutuelMarket */
  fixtureCount?: number;
  /** Total market count (fixtures × market-types) */
  marketCount?: number;
}

export function XCupHero({ liveCount, fixtureCount, marketCount }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-stadium-line bg-gradient-to-br from-[#141B12] to-[#0F140E] p-7 md:p-9">
      <HexGrid color="#E7B84F" opacity={0.05} />
      <div className="halo-gold-radial absolute inset-0 pointer-events-none" />

      {/* 3D trophy decoration bottom-right */}
      <div className="absolute -right-6 -bottom-6 opacity-90 pointer-events-none">
        <Trophy
          className="w-44 h-44 text-gold"
          strokeWidth={1.2}
          style={{ filter: 'drop-shadow(0 0 28px rgba(231,184,79,0.45))' }}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] tracking-[0.16em] uppercase font-bold bg-gold-bg border border-gold-border text-gold">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" style={{ animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
            World Cup 2026
          </span>
          {liveCount !== undefined && liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] tracking-[0.16em] uppercase font-bold bg-pitch-bg border border-pitch-border text-pitch">
              <span className="w-1.5 h-1.5 rounded-full bg-pitch" style={{ animation: 'pulse-dot 1.2s ease-in-out infinite' }} />
              {liveCount} live now
            </span>
          )}
          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] tracking-[0.16em] uppercase font-bold bg-stadium-elevated border border-stadium-line text-stadium-text-secondary">
            X Layer · chain 196
          </span>
        </div>

        <h1 className="font-display text-stadium-text leading-[1.02]" style={{ fontSize: 'clamp(40px, 6vw, 64px)', fontWeight: 800, letterSpacing: '0.01em' }}>
          X Cup
        </h1>

        <p className="text-stadium-text-secondary text-base md:text-lg max-w-xl">
          Real-money pari-mutuel football markets, settled by a bonded
          multi-source oracle. Free picks if you don't want to stake.
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-1">
          {fixtureCount !== undefined && (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-stadium-elevated border border-stadium-line text-stadium-text-secondary">
              {fixtureCount} {fixtureCount === 1 ? 'fixture' : 'fixtures'}
              {marketCount !== undefined && marketCount !== fixtureCount && (
                <span className="text-stadium-text-muted"> · {marketCount} markets</span>
              )}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-pitch-bg border border-pitch-border text-pitch font-bold">
            3 market types · 1X2 · O/U · BTTS
          </span>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-stadium-elevated border border-stadium-line text-stadium-text-secondary">
            CupOracleV3 bonded
          </span>
        </div>
      </div>
    </div>
  );
}
