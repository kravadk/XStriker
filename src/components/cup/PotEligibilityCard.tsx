import { useEffect, useState } from 'react';
import { Trophy, ArrowRight } from 'lucide-react';
import { useUiStore } from '@shared/store/uiStore';
import { AnimatedNumber } from '@shared/common/AnimatedNumber';

interface PotState {
  deployed: boolean;
  potAddress?: string;
  payoutToken?: string;
  currentWeekId?: number;
  tokenBalance?: string;
  weeks?: {
    weekId: number;
    potAmount: string;
    settled: boolean;
    sharePerWinner: string;
    winnersCount: number;
  }[];
}

interface Props {
  /** Bracket pick accuracy — used in eligibility copy */
  correct?: number;
  scored?: number;
}

export function PotEligibilityCard({ correct, scored }: Props) {
  const setProduct = useUiStore((s) => s.setProduct);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const [pot, setPot] = useState<PotState | null>(null);

  useEffect(() => {
    fetch('/api/hook/pot')
      .then((r) => (r.ok ? (r.json() as Promise<PotState>) : null))
      .then(setPot)
      .catch(() => setPot(null));
  }, []);

  const goToPot = () => {
    setProduct('hook');
    setActiveTab('hook-pot');
  };

  if (!pot || !pot.deployed) {
    return null;
  }

  const totalLocked = pot.tokenBalance ? Number(pot.tokenBalance) / 1e6 : 0;
  const openWeek = pot.weeks?.find((w) => !w.settled);
  const eligible = scored !== undefined && scored > 0 && correct !== undefined && correct > 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-gold-border p-5 md:p-6"
      style={{
        background:
          'linear-gradient(135deg, rgba(231,184,79,0.14) 0%, rgba(231,184,79,0.03) 100%)',
        boxShadow: '0 0 32px rgba(231,184,79,0.18)',
      }}
    >
      <div className="absolute -right-4 -bottom-4 opacity-80 pointer-events-none">
        <Trophy
          className="w-24 h-24 text-gold"
          style={{ filter: 'drop-shadow(0 0 12px rgba(231,184,79,0.5))' }}
          strokeWidth={1.2}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-3 max-w-md">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gold text-[10px] tracking-[0.2em] uppercase font-bold">
            CupSidePot · your bracket eligibility
          </span>
          {pot.currentWeekId !== undefined && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gold-bg border border-gold-border text-gold font-bold">
              WEEK #{pot.currentWeekId}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-3 flex-wrap">
          <div
            className="font-display text-gold leading-none"
            style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800 }}
          >
            <AnimatedNumber value={totalLocked} prefix="$" decimals={4} />
          </div>
          <div className="text-xs uppercase tracking-widest text-stadium-text-muted">total locked</div>
        </div>

        <p className="text-sm text-stadium-text-secondary">
          Half of every FanFeeHook spread above 5 bps lands here. {' '}
          {eligible ? (
            <>
              Your bracket — <span className="font-bold text-stadium-text">
                {correct}/{scored} correct
              </span>{' '}
              — qualifies for a pro-rata share of the open week.
            </>
          ) : openWeek ? (
            <>Submit a bracket to qualify for week #{openWeek.weekId} settle.</>
          ) : (
            <>No open week — next settle starts when the operator posts results.</>
          )}
        </p>

        <button
          onClick={goToPot}
          className="inline-flex w-fit items-center gap-2 rounded-xl btn-premium-gold px-4 py-2.5 text-sm mt-1"
        >
          Open pot <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
