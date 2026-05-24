import { useEffect, useState } from 'react';
import { Anchor, ArrowRight } from 'lucide-react';
import { useWalletStore } from '@shared/store/walletStore';
import { useUiStore } from '@shared/store/uiStore';
import { AnimatedNumber } from '@shared/common/AnimatedNumber';

interface TierInfo {
  wallet: string;
  score: number;
  tier: number;
  tierLabel: string;
  feeBps: number;
  hasFanPass: boolean;
  verdict: string;
}

const TIER_COLOR: Record<number, string> = {
  0: '#9DA89C',
  1: '#4AA8E0',
  2: '#34C172',
  3: '#E7B84F',
};

export function HookDiscountCard() {
  const { connected, address } = useWalletStore();
  const setProduct = useUiStore((s) => s.setProduct);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const [tier, setTier] = useState<TierInfo | null>(null);

  useEffect(() => {
    if (!connected || !address) {
      setTier(null);
      return;
    }
    fetch(`/api/hook/tier?address=${address}`)
      .then((r) => (r.ok ? (r.json() as Promise<TierInfo>) : null))
      .then(setTier)
      .catch(() => setTier(null));
  }, [connected, address]);

  const goToSwap = () => {
    setProduct('hook');
    setActiveTab('hook-swap');
  };

  const stroke = TIER_COLOR[tier?.tier ?? 0];
  const saved = tier ? Math.max(0, 30 - tier.feeBps) : 0;
  const multiple = tier && tier.feeBps > 0 ? (30 / tier.feeBps).toFixed(1) : '6';

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5 md:p-6"
      style={{
        background: `linear-gradient(135deg, ${stroke}1A 0%, ${stroke}05 100%)`,
        borderColor: `${stroke}55`,
        boxShadow: `0 0 24px ${stroke}22`,
      }}
    >
      <div className="absolute -right-4 -bottom-4 opacity-80 pointer-events-none">
        <Anchor
          className="w-24 h-24"
          style={{ color: stroke, filter: `drop-shadow(0 0 12px ${stroke}55)` }}
          strokeWidth={1.2}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-3 max-w-md">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: stroke }}>
            FanFeeHook · your swap discount
          </span>
        </div>

        {!connected ? (
          <p className="text-sm text-stadium-text-secondary">
            Connect your wallet — your FanPass tier directly lowers the fee
            you pay on FanFeeHook swaps.
          </p>
        ) : !tier ? (
          <div className="py-2 text-xs text-stadium-text-muted">computing your tier…</div>
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div
                className="font-display leading-none"
                style={{ color: stroke, fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800 }}
              >
                <AnimatedNumber value={tier.feeBps} decimals={0} suffix=" bps" />
              </div>
              <div className="text-xs uppercase tracking-widest text-stadium-text-muted">
                tier{' '}
                <span className="font-bold" style={{ color: stroke }}>
                  {tier.tierLabel.toUpperCase()}
                </span>
              </div>
            </div>
            <p className="text-sm text-stadium-text-secondary">
              <span className="font-bold text-stadium-text">{multiple}× cheaper</span> than an
              unknown wallet — you save{' '}
              <span className="font-mono font-bold" style={{ color: stroke }}>
                {saved} bps
              </span>{' '}
              per swap on the live USDT/USDC hook pool.
            </p>
          </>
        )}

        <button
          onClick={goToSwap}
          className="inline-flex w-fit items-center gap-2 rounded-xl btn-premium-pitch px-4 py-2.5 text-sm mt-1"
        >
          Try a swap <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
