import type { ReactNode } from 'react';
import { Sparkline } from '@shared/common/Sparkline';
import { AnimatedNumber } from '@shared/common/AnimatedNumber';
import { Trophy, Activity, Network, BadgeCheck } from 'lucide-react';

type Variant = 'live' | 'pool' | 'bracket' | 'fanpass';

interface Props {
  variant: Variant;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  /** Optional micro-chart series (Sparkline / histogram) */
  series?: number[];
  /** Optional footer line */
  footer?: string;
  loading?: boolean;
  decimals?: number;
}

const STYLE: Record<Variant, { ring: string; tint: string; glow: string; label: string }> = {
  live: {
    ring: 'border-[rgba(224,88,74,0.32)]',
    tint: 'bg-[linear-gradient(180deg,rgba(224,88,74,0.10)_0%,rgba(224,88,74,0.02)_100%)]',
    glow: 'shadow-[0_0_24px_rgba(224,88,74,0.18)]',
    label: 'text-outcome-loss',
  },
  pool: {
    ring: 'border-[rgba(52,193,114,0.32)]',
    tint: 'bg-[linear-gradient(180deg,rgba(52,193,114,0.10)_0%,rgba(52,193,114,0.02)_100%)]',
    glow: 'shadow-[0_0_24px_rgba(52,193,114,0.18)]',
    label: 'text-pitch',
  },
  bracket: {
    ring: 'border-[rgba(74,168,224,0.32)]',
    tint: 'bg-[linear-gradient(180deg,rgba(74,168,224,0.10)_0%,rgba(74,168,224,0.02)_100%)]',
    glow: 'shadow-[0_0_24px_rgba(74,168,224,0.18)]',
    label: 'text-outcome-away',
  },
  fanpass: {
    ring: 'border-[rgba(231,184,79,0.45)]',
    tint: 'bg-[linear-gradient(180deg,rgba(231,184,79,0.16)_0%,rgba(231,184,79,0.04)_100%)]',
    glow: 'shadow-[0_0_32px_rgba(231,184,79,0.32)]',
    label: 'text-gold',
  },
};

function PulseDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}`, animation: 'pulse-dot 1.2s ease-in-out infinite' }}
    />
  );
}

export function XCupMiniWidget({ variant, label, value, prefix, suffix, series, footer, loading, decimals }: Props) {
  const s = STYLE[variant];
  const dec = decimals ?? (variant === 'pool' ? 2 : 0);

  const decoration: ReactNode = (() => {
    if (loading) return null;
    if (variant === 'live') return <PulseDot color="#E0584A" />;
    if (variant === 'pool' && series && series.length > 0) return <Sparkline data={series} color="#34C172" height={28} />;
    if (variant === 'bracket') return <Network className="w-7 h-7 text-outcome-away drop-shadow-[0_0_8px_rgba(74,168,224,0.5)]" />;
    if (variant === 'fanpass') return <BadgeCheck className="w-7 h-7 text-gold drop-shadow-[0_0_8px_rgba(231,184,79,0.6)]" />;
    return null;
  })();

  const cornerIcon: ReactNode = (() => {
    if (variant === 'live') return <Activity className="w-5 h-5 text-outcome-loss/70" />;
    if (variant === 'pool') return <Trophy className="w-5 h-5 text-pitch/70" />;
    return null;
  })();

  return (
    <div
      className={`relative rounded-2xl border ${s.ring} ${s.tint} ${s.glow} p-4 flex flex-col justify-between min-h-[130px] overflow-hidden`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] tracking-[0.18em] uppercase font-bold ${s.label}`}>{label}</span>
        {(variant === 'bracket' || variant === 'fanpass' || variant === 'live') && (
          <div className="flex-shrink-0">{decoration}</div>
        )}
        {cornerIcon && variant === 'pool' && (
          <div className="flex-shrink-0">{cornerIcon}</div>
        )}
      </div>

      <div className="font-display text-stadium-text text-3xl leading-none my-2" style={{ fontWeight: 800 }}>
        {loading ? (
          <span className="skeleton inline-block h-8 w-20" />
        ) : (
          <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={dec} />
        )}
      </div>

      {variant === 'pool' && decoration}

      {footer && (
        <div className="text-[11px] text-stadium-text-secondary mt-1 truncate">{footer}</div>
      )}
    </div>
  );
}
