import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, Wallet, ExternalLink } from 'lucide-react';
import { api } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useUiStore } from '@shared/store/uiStore';
import { useWalletStore } from '@shared/store/walletStore';
import { toast } from '@shared/store/toastStore';
import { MatchupHeader, MarketStatusBadge, StatePanel, toBaseUnits, formatPool } from '@xcup/components/cup/CupKit';
import { cn } from '@shared/utils/format';
import { FreePickPanel } from '@xcup/components/cup/FreePickPanel';
import { PunditReadCard } from '@xcup/components/cup/PunditReadCard';
import { InfoTip } from '@shared/common/InfoTip';
import { readErc20Balance, readErc20Allowance } from '@shared/lib/erc20';
import { explorerAddress } from '@shared/config/links';

const OUTCOME_COLORS_3 = [
  'var(--color-outcome-home)',
  'var(--color-outcome-draw)',
  'var(--color-outcome-away)',
];
const OUTCOME_COLORS_2 = ['var(--color-outcome-home)', 'var(--color-outcome-away)'];

/**
 * Tokens a fan can stake with. USDT is the settlement token (direct approve+stake);
 * any other is swapped to USDT in the user's wallet via the OKX DEX aggregator first.
 */
const STAKE_TOKENS = [
  { symbol: 'USDT', address: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', decimals: 6 },
  { symbol: 'USDC', address: '0x74b7F16337b8972027F6196A17a631aC6dE26d22', decimals: 6 },
  { symbol: 'OKB', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18 },
] as const;

/** Parse a human decimal string into token base units, exactly (no float rounding). */
function toUnits(amountStr: string, decimals: number): string {
  const [whole, frac = ''] = amountStr.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')).toString();
}

/**
 * Pull the spender address out of an `approve(spender, amount)` calldata blob.
 * Layout: `0x` + 4-byte selector + 32-byte spender slot + 32-byte amount slot.
 * The address sits in the last 20 bytes of the spender slot (chars 34..74).
 * Used by the stake pre-flight to read the user's allowance against the exact
 * market the backend is about to ask them to spend to.
 */
function extractApproveSpender(approveData: string): string {
  return '0x' + approveData.slice(34, 74).toLowerCase();
}

export function MarketDetailPage() {
  const matchId = useUiStore((s) => s.marketDetailId);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const setConnectModalOpen = useUiStore((s) => s.setConnectModalOpen);
  const { connected, sendTx, waitForTx, address, onXLayer } = useWalletStore();
  const { data, loading, error, reload } = useApi(
    () => (matchId ? api.market(matchId) : Promise.resolve(null)),
    [matchId],
  );

  const [outcome, setOutcome] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState('');
  const [stakeToken, setStakeToken] = useState<string>('USDT');
  const [busy, setBusy] = useState<null | 'approve' | 'stake'>(null);

  // Reset the pick when the open market changes — outcome count differs per type,
  // so a stale `outcome` index must never carry across markets.
  useEffect(() => {
    setOutcome(1);
    setAmount('');
  }, [matchId]);

  if (!matchId) {
    return <div className="mx-auto max-w-md py-20 text-center text-sm text-stadium-text-secondary">No market selected.</div>;
  }

  const canStake = data?.marketStatus === 'open';
  const amountNum = Number(amount) || 0;
  const outcomeLabels = data?.outcomeLabels ?? ['Home', 'Draw', 'Away'];
  const outcomeColors = outcomeLabels.length === 2 ? OUTCOME_COLORS_2 : OUTCOME_COLORS_3;
  const outcomes = outcomeLabels.map((label, i) => ({
    id: (i + 1) as 1 | 2 | 3,
    label,
    color: outcomeColors[i] ?? OUTCOME_COLORS_3[2],
  }));

  async function handleApprove() {
    if (!data || amountNum <= 0) return;
    setBusy('approve');
    try {
      const { approveTx } = await api.marketStakeTx(matchId!, outcome, toBaseUnits(amountNum));
      const hash = await sendTx(approveTx);
      await waitForTx(hash); // wait for the approval to mine before stake is allowed
      toast.success('Approval confirmed — you can stake now');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleStake() {
    if (!data || amountNum <= 0 || !address) return;
    setBusy('stake');
    try {
      const usdt = STAKE_TOKENS[0];
      const amountUnits = BigInt(toBaseUnits(amountNum));
      const { approveTx, stakeTx } = await api.marketStakeTx(matchId!, outcome, amountUnits.toString());
      const market = extractApproveSpender(approveTx.data);
      // Pre-flight directly against the chain so we can refuse to open the
      // wallet popup (with a clear toast) instead of letting the wallet's
      // simulator throw a generic "Execution error" for missing balance or
      // allowance — the most common reason for a failed first stake attempt.
      const [balance, allowance] = await Promise.all([
        readErc20Balance(usdt.address, address),
        readErc20Allowance(usdt.address, address, market),
      ]);
      if (balance < amountUnits) {
        const have = (Number(balance) / 10 ** usdt.decimals).toFixed(2);
        toast.error(`Not enough USDT — you have ${have}, need ${amountNum.toFixed(2)}`);
        return;
      }
      if (allowance < amountUnits) {
        toast.error('Approve USDT first — press "1 · Approve" and wait for the confirmation toast');
        return;
      }
      const hash = await sendTx(stakeTx);
      toast.success(`Stake submitted · ${hash.slice(0, 10)}…`);
      setAmount('');
      // Cue My Bets to ride out the indexer lag so the new position appears
      // shortly even without a manual refresh.
      useUiStore.getState().bumpRecentStake();
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Stake failed');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Stake with a non-USDT token: OKX DEX swaps it to USDT in the user's wallet,
   * then approve + stake follow. Steps must mine in order, so each is awaited.
   */
  async function handleSwapStake() {
    const tok = STAKE_TOKENS.find((t) => t.symbol === stakeToken);
    if (!data || amountNum <= 0 || !address || !tok) return;
    setBusy('stake');
    let stepsCompleted = 0;
    try {
      const { steps, minUsdt } = await api.marketSwapStakeTx(matchId!, {
        fromToken: tok.address,
        amount: toUnits(amount, tok.decimals),
        outcome,
        wallet: address,
      });
      toast.success(`Confirm ${steps.length} transactions in your wallet…`);
      for (const step of steps) {
        const hash = await sendTx({ to: step.to, data: step.data, value: step.value });
        await waitForTx(hash);
        stepsCompleted += 1;
      }
      toast.success(`Staked ≈${(Number(minUsdt) / 1e6).toFixed(2)} USDT via OKX DEX`);
      setAmount('');
      useUiStore.getState().bumpRecentStake();
      void reload();
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'unknown error';
      if (stepsCompleted > 0) {
        // Partial failure mid-pipeline: the swap leg likely succeeded, so USDT
        // is now sitting in the user's wallet. Switch the token picker back to
        // USDT so a retry takes the direct approve+stake path — no second
        // swap, no leftover dust, just finish the stake they already paid for.
        setStakeToken('USDT');
        toast.error(
          `Swap may have succeeded — USDT is in your wallet. Next step failed: ${reason}. Press "1 · Approve" then "2 · Stake" to finish.`,
        );
      } else {
        toast.error(reason);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button
        onClick={() => setActiveTab('markets')}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-stadium-text-secondary hover:text-stadium-text"
      >
        <ArrowLeft className="h-4 w-4" /> All markets
      </button>

      <StatePanel loading={loading} error={error} empty={!data} emptyLabel="Market not found" onRetry={reload}>
        {data && (
          <div className="flex flex-col gap-4">
            {/* hero */}
            <div className="stadium-card pitch-stripes overflow-hidden p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-stadium-text-muted">
                  {data.stage} · <span className="text-gold">{data.marketTypeLabel}</span>
                </span>
                <MarketStatusBadge status={data.marketStatus} />
              </div>
              <MatchupHeader home={data.home} away={data.away} size="lg" kickoffUtc={data.kickoffUtc} />
              <div className="mt-4 flex justify-between border-t border-stadium-line pt-3 text-xs">
                <span className="inline-flex items-center gap-1 text-stadium-text-secondary">
                  Pool <span className="font-mono font-semibold text-stadium-text">{formatPool(data.pools.total)}</span>
                  <InfoTip label="How payouts work">
                    Every stake joins one shared pool. When the market settles, the winning
                    side splits the whole pool pro-rata — your payout ≈ your stake × pool ÷
                    total winning stake. No fixed odds, no house.
                  </InfoTip>
                </span>
                <span className="text-stadium-text-secondary">{data.venue}</span>
              </div>
            </div>

            {/* AI pundit read — a 1X2 signal, shown only on the Match Result market */}
            {data.marketType === '1X2' && <PunditReadCard matchId={data.cupMatchId} />}

            {/* outcome buckets */}
            <div className={cn('grid gap-2', outcomes.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
              {outcomes.map((o) => {
                const implied = [0, data.impliedOdds.home, data.impliedOdds.draw, data.impliedOdds.away][o.id];
                const fair = data.aiFairOdds
                  ? [0, data.aiFairOdds.home, data.aiFairOdds.draw, data.aiFairOdds.away][o.id]
                  : null;
                const active = outcome === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setOutcome(o.id)}
                    disabled={!canStake}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all disabled:opacity-60',
                      active ? 'border-pitch bg-pitch-bg' : 'border-stadium-line hover:border-stadium-line-strong',
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-stadium-text-muted">{o.label}</div>
                    <div className="font-display mt-1 text-xl" style={{ color: o.color }}>
                      {Math.round(implied * 100)}%
                    </div>
                    <div className="text-[10px] text-stadium-text-secondary">
                      {data.marketType === '1X2'
                        ? `AI fair ${fair !== null ? `${Math.round(fair * 100)}%` : '—'}`
                        : 'pool-implied'}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* stake panel */}
            <div className="stadium-card p-4">
              {canStake ? (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-pitch" />
                    <span className="text-sm font-bold text-stadium-text">
                      Stake on {outcomeLabels[outcome - 1] ?? outcomeLabels[0]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-stadium-line bg-stadium-base px-3 py-2.5 font-mono text-sm text-stadium-text outline-none focus:border-pitch-border"
                    />
                    <select
                      value={stakeToken}
                      onChange={(e) => setStakeToken(e.target.value)}
                      className="rounded-lg border border-stadium-line bg-stadium-base px-2 py-2.5 text-xs font-bold text-stadium-text-secondary outline-none focus:border-pitch-border"
                    >
                      {STAKE_TOKENS.map((t) => (
                        <option key={t.symbol} value={t.symbol}>
                          {t.symbol}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!connected ? (
                    <button
                      onClick={() => setConnectModalOpen(true)}
                      className="mt-3 w-full rounded-xl bg-pitch py-2.5 text-sm font-bold text-stadium-base hover:bg-pitch-bright glow-pitch"
                    >
                      Connect wallet to stake
                    </button>
                  ) : stakeToken === 'USDT' ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => void handleApprove()}
                        disabled={busy !== null || amountNum <= 0 || !onXLayer}
                        className="rounded-xl border border-stadium-line-strong py-2.5 text-sm font-bold text-stadium-text hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-50"
                      >
                        {busy === 'approve' ? 'Approving…' : '1 · Approve'}
                      </button>
                      <button
                        onClick={() => void handleStake()}
                        disabled={busy !== null || amountNum <= 0 || !onXLayer}
                        className="rounded-xl bg-pitch py-2.5 text-sm font-bold text-stadium-base hover:bg-pitch-bright disabled:opacity-50"
                      >
                        {busy === 'stake' ? 'Staking…' : '2 · Stake'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleSwapStake()}
                      disabled={busy !== null || amountNum <= 0 || !onXLayer}
                      className="mt-3 w-full rounded-xl bg-pitch py-2.5 text-sm font-bold text-stadium-base hover:bg-pitch-bright disabled:opacity-50 glow-pitch"
                    >
                      {busy === 'stake' ? 'Swapping & staking…' : `Swap ${stakeToken} → USDT & stake`}
                    </button>
                  )}
                  {connected && !onXLayer && (
                    <p className="mt-2 text-[11px] font-semibold text-outcome-loss">
                      Switch your wallet to X Layer (chain 196) to stake.
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-stadium-text-muted">
                    {stakeToken === 'USDT'
                      ? 'Approve lets the pool pull your USDT; stake enters the pool. Winners split the pool pro-rata after the oracle finalizes.'
                      : `OKX DEX swaps your ${stakeToken} into USDT in your wallet, then stakes it — a few wallet signatures. Winners split the pool pro-rata.`}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2.5 text-sm text-stadium-text-secondary">
                  <ShieldCheck className="h-4 w-4 text-gold" />
                  {data.marketStatus === 'contract_not_deployed'
                    ? 'The pool contract is not deployed yet — staking opens after the mainnet deploy.'
                    : data.marketStatus === 'market_not_created'
                      ? 'This market has not been opened on-chain yet.'
                      : data.marketStatus === 'awaiting_settlement'
                        ? 'Staking is closed — waiting for the oracle to finalize the result.'
                        : 'This market is settled. Claim winnings from My Bets.'}
                </div>
              )}
            </div>

            {/* free-to-play pick — 1X2 only */}
            {data.marketType === '1X2' && (
              <FreePickPanel matchId={data.cupMatchId} locked={data.matchStatus !== 'scheduled'} />
            )}

            {/* oracle strip */}
            <div className="stadium-card flex items-center justify-between p-3.5 text-xs">
              <span className="inline-flex items-center gap-1 text-stadium-text-secondary">
                Settlement oracle
                <InfoTip label="About the settlement oracle">
                  Results are proposed under a USDT bond and stay open to challenge for a
                  fixed window. A wrong result can be challenged — the loser forfeits the
                  bond. Lying costs money, so the posted result is the honest one.
                </InfoTip>
              </span>
              {data.oracleContract?.address ? (
                <a
                  href={explorerAddress(data.oracleContract.address)}
                  target="_blank"
                  rel="noreferrer"
                  title={`View ${data.oracleContract.address} on X Layer explorer`}
                  className="flex items-center gap-1.5 font-mono text-stadium-text hover:text-pitch hover:underline"
                >
                  {data.oracleContract.name ?? 'CupOracle'}
                  {data.oracleContract.bonded ? ' · bonded' : ''}
                  {data.oracle?.registered ? ` · state ${data.oracle.state ?? 0}` : ' · awaiting registration'}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ) : (
                <span className="font-mono text-stadium-text">
                  {data.oracleContract?.name ?? 'CupOracle'}
                  {data.oracleContract?.bonded ? ' · bonded' : ''}
                  {data.oracle?.registered ? ` · state ${data.oracle.state ?? 0}` : ' · awaiting registration'}
                </span>
              )}
            </div>
          </div>
        )}
      </StatePanel>
    </div>
  );
}
