import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { TeamLogo } from './TeamLogo';
import { cn } from '@shared/utils/format';
import type { MarketStatusDto } from '@shared/api/client';
import { useSyncStore } from '@shared/store/syncStore';

/* ---- formatting helpers ---- */

/** Token base units (6-decimal USDT/USDC) → a plain number. */
export function fromBaseUnits(value: string | undefined, decimals = 6): number {
  if (!value) return 0;
  try {
    return Number(BigInt(value)) / 10 ** decimals;
  } catch {
    return 0;
  }
}

export function toBaseUnits(amount: number, decimals = 6): string {
  return BigInt(Math.round(amount * 10 ** decimals)).toString();
}

export function formatPool(value: string | undefined): string {
  const n = fromBaseUnits(value);
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 })}`;
}

export function kickoffCountdown(iso: string): { label: string; live: boolean } {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { label: 'TBD', live: false };
  const diff = t - Date.now();
  if (diff <= 0) {
    return diff > -3.5 * 3600_000 ? { label: 'LIVE', live: true } : { label: 'Full time', live: false };
  }
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return { label: `${d}d ${h}h`, live: false };
  if (h > 0) return { label: `${h}h ${m}m`, live: false };
  return { label: `${m}m`, live: false };
}

/* ---- page chrome ---- */

export function PageHeader({ kicker, title, sub, action }: { kicker: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="text-micro text-pitch">{kicker}</div>
        <h1 className="font-display mt-1 text-3xl tracking-wide text-stadium-text md:text-4xl">{title}</h1>
        {sub && <p className="mt-1.5 max-w-xl text-sm text-stadium-text-secondary">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Skeleton grid + an after-the-fact "backend warming up" banner. Render shows
 * skeletons immediately on every load, but if the backend takes more than ~8s
 * and is also reporting unreachable, we add an explainer so the user knows the
 * blank screen is a Render cold start, not a broken site.
 */
function LoadingState() {
  const backendOnline = useSyncStore((s) => s.online);
  const [coldStart, setColdStart] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setColdStart(true), 8_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      {coldStart && !backendOnline && (
        <div className="rounded-xl border border-[rgba(56,189,248,0.20)] bg-[rgba(56,189,248,0.06)] p-3 text-xs leading-relaxed text-[#9DA89C]">
          Backend is warming up — first load after an idle period usually takes ~30 seconds…
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-44 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function StatePanel({
  loading,
  error,
  empty,
  emptyLabel,
  emptyAction,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyLabel?: string;
  /** Optional next step shown inside the empty state so it's never a dead end. */
  emptyAction?: { label: string; onClick: () => void };
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return (
      <div className="stadium-card flex flex-col items-center gap-3 p-10 text-center">
        <AlertTriangle className="h-7 w-7 text-outcome-loss" />
        <div className="text-sm font-semibold text-stadium-text">Could not reach the backend</div>
        <div className="max-w-md text-xs text-stadium-text-secondary">{error}</div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 flex items-center gap-2 rounded-lg border border-stadium-line px-3 py-1.5 text-xs font-semibold text-stadium-text hover:bg-[rgba(255,255,255,0.05)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="stadium-card flex flex-col items-center gap-2 p-12 text-center">
        <div className="text-3xl">⚽</div>
        <div className="text-sm font-semibold text-stadium-text">{emptyLabel ?? 'Nothing here yet'}</div>
        {emptyAction && (
          <button
            onClick={emptyAction.onClick}
            className="mt-2 rounded-xl bg-pitch px-4 py-2 text-xs font-bold text-stadium-base hover:bg-pitch-bright glow-pitch"
          >
            {emptyAction.label}
          </button>
        )}
      </div>
    );
  }
  return <>{children}</>;
}

/* ---- match + outcome primitives ---- */

export function MatchupHeader({
  home,
  away,
  size = 'md',
  kickoffUtc,
}: {
  home: { code: string; name: string };
  away: { code: string; name: string };
  size?: 'sm' | 'md' | 'lg';
  kickoffUtc?: string;
}) {
  const logo = size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md';
  const codeCls = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  const countdown = kickoffUtc ? kickoffCountdown(kickoffUtc) : null;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TeamLogo code={home.code} name={home.name} size={logo} />
        <span className={cn('font-display tracking-wide text-stadium-text', codeCls)}>{home.code}</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="font-display text-stadium-text-muted">v</span>
        {countdown && (
          <span
            className={cn(
              'mt-0.5 rounded px-1.5 text-[10px] font-bold tabular',
              countdown.live ? 'bg-[rgba(224,88,74,0.14)] text-outcome-loss' : 'text-stadium-text-secondary',
            )}
          >
            {countdown.label}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
        <span className={cn('font-display tracking-wide text-stadium-text', codeCls)}>{away.code}</span>
        <TeamLogo code={away.code} name={away.name} size={logo} />
      </div>
    </div>
  );
}

const OUTCOME_LABEL = ['', 'Home', 'Draw', 'Away'];

export function OutcomeBar({
  odds,
  winningOutcome,
  outcomeLabels,
}: {
  odds: { home: number; draw: number; away: number };
  winningOutcome?: number | null;
  /** Labels for contract outcomes 1..N. Defaults to Home/Draw/Away (1X2). */
  outcomeLabels?: string[];
}) {
  const labels = outcomeLabels && outcomeLabels.length >= 2 ? outcomeLabels : ['Home', 'Draw', 'Away'];
  const palette =
    labels.length === 2
      ? ['var(--color-outcome-home)', 'var(--color-outcome-away)']
      : ['var(--color-outcome-home)', 'var(--color-outcome-draw)', 'var(--color-outcome-away)'];
  const values = [odds.home, odds.draw, odds.away];
  const cells = labels.map((label, i) => ({
    key: (i + 1) as 1 | 2 | 3,
    v: values[i] ?? 0,
    color: palette[i] ?? 'var(--color-outcome-away)',
    label,
  }));
  const total = cells.reduce((sum, c) => sum + c.v, 0);
  const seg = (v: number) => (total > 0 ? (v / total) * 100 : 100 / cells.length);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
        {cells.map((c) => (
          <div
            key={c.key}
            style={{
              width: `${seg(c.v)}%`,
              background: c.color,
              opacity: winningOutcome && winningOutcome !== c.key ? 0.25 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold tabular">
        {cells.map((c) => (
          <span
            key={c.key}
            className={cn(winningOutcome === c.key && 'text-gold')}
            style={{ color: winningOutcome === c.key ? undefined : c.color }}
          >
            {c.label} {total > 0 ? `${Math.round(seg(c.v))}%` : '—'}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATUS_META: Record<MarketStatusDto, { label: string; cls: string }> = {
  contract_not_deployed: { label: 'Contract pending', cls: 'text-stadium-text-muted bg-[rgba(255,255,255,0.05)]' },
  market_not_created: { label: 'Not opened', cls: 'text-stadium-text-secondary bg-[rgba(255,255,255,0.05)]' },
  open: { label: 'Open', cls: 'text-pitch bg-pitch-bg' },
  awaiting_settlement: { label: 'Awaiting result', cls: 'text-gold bg-gold-bg' },
  settled: { label: 'Settled', cls: 'text-gold bg-gold-bg' },
  refund: { label: 'Refund', cls: 'text-outcome-away bg-[rgba(74,168,224,0.12)]' },
};

export function MarketStatusBadge({ status }: { status: MarketStatusDto }) {
  const m = STATUS_META[status];
  return <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', m.cls)}>{m.label}</span>;
}

export { OUTCOME_LABEL };
