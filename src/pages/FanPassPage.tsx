import { BadgeCheck, Wallet, ExternalLink } from 'lucide-react';
import { api } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useWalletStore } from '@shared/store/walletStore';
import { useUiStore } from '@shared/store/uiStore';
import { PageHeader, StatePanel } from '@xcup/components/cup/CupKit';
import { InfoTip } from '@shared/common/InfoTip';
import { explorerAddress } from '@shared/config/links';

const BREAKDOWN_LABELS: Record<string, string> = {
  x402Usage: 'x402 usage',
  cupInteractions: 'Cup interactions',
  onchainActivity: 'On-chain activity',
  consistency: 'Consistency',
  oracleParticipation: 'Oracle participation',
};

export function FanPassPage() {
  const { connected, address } = useWalletStore();
  const setConnectModalOpen = useUiStore((s) => s.setConnectModalOpen);
  const score = useApi(
    () => (connected && address ? api.cupFanScore(address) : Promise.resolve(null)),
    [connected, address],
  );
  const sbt = useApi(
    () => (connected && address ? api.cupFanPassSbtEligibility(address) : Promise.resolve(null)),
    [connected, address],
  );

  if (!connected) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader kicker="On-chain reputation" title="FanPass" />
        <div className="stadium-card flex flex-col items-center gap-3 p-12 text-center">
          <Wallet className="h-7 w-7 text-pitch" />
          <div className="text-sm font-semibold text-stadium-text">Connect your wallet to view your FanPass</div>
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
        kicker="On-chain reputation"
        title="FanPass"
        sub="A soulbound badge that scores your football IQ — pick accuracy, on-chain activity and oracle participation."
      />
      <StatePanel
        loading={score.loading || sbt.loading}
        error={score.error || sbt.error}
        empty={!score.data}
        onRetry={() => {
          score.reload();
          sbt.reload();
        }}
      >
        {score.data && (
          <div className="flex flex-col gap-4">
            <div className="stadium-card pitch-stripes flex items-center gap-5 p-5">
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-pitch-bg ring-2 ring-pitch-border">
                <div className="text-center">
                  <div className="font-display text-3xl text-pitch">{score.data.score}</div>
                  <div className="text-[9px] uppercase tracking-wider text-stadium-text-muted">score</div>
                </div>
              </div>
              <div className="flex-1">
                <div className="text-micro text-stadium-text-muted">Tier</div>
                <div className="font-display text-2xl tracking-wide text-stadium-text">
                  {score.data.level.replace('-', ' ').toUpperCase()}
                </div>
                <div className="mt-1 text-xs text-stadium-text-secondary">{score.data.verdict}</div>
              </div>
            </div>

            <div className="stadium-card p-4">
              <div className="mb-3 flex items-center gap-1 text-micro text-pitch">
                Score breakdown
                <InfoTip label="About your FanPass score">
                  Your FanPass score blends pick accuracy, on-chain activity, oracle
                  participation and consistency into one number. Cross the threshold and the
                  soulbound FanPass badge becomes mintable.
                </InfoTip>
              </div>
              <div className="flex flex-col gap-2.5">
                {Object.entries(score.data.breakdown).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs">
                      <span className="text-stadium-text-secondary">{BREAKDOWN_LABELS[k] ?? k}</span>
                      <span className="font-mono text-stadium-text">{v}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
                      <div className="h-full rounded-full bg-pitch" style={{ width: `${Math.min(100, Number(v))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {sbt.data && (
              <div className="stadium-card flex items-start gap-3.5 p-4">
                <BadgeCheck
                  className={`mt-0.5 h-6 w-6 shrink-0 ${sbt.data.minted ? 'text-gold' : 'text-stadium-text-muted'}`}
                />
                <div className="flex-1">
                  <div className="text-sm font-bold text-stadium-text">
                    FanPass SBT —{' '}
                    {sbt.data.minted
                      ? `minted · #${sbt.data.tokenId}`
                      : sbt.data.eligible
                        ? 'eligible'
                        : 'not eligible yet'}
                  </div>
                  <div className="mt-1 text-xs text-stadium-text-secondary">{sbt.data.reason}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-stadium-text-muted">
                    {sbt.data.contract.address ? (
                      <>
                        <span>Contract</span>
                        <a
                          href={explorerAddress(sbt.data.contract.address)}
                          target="_blank"
                          rel="noreferrer"
                          title={`View ${sbt.data.contract.address} on X Layer explorer`}
                          className="inline-flex items-center gap-1 text-stadium-text hover:text-pitch hover:underline"
                        >
                          {sbt.data.contract.address}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      </>
                    ) : (
                      <span>SBT contract not deployed yet</span>
                    )}
                    {sbt.data.eligible && !sbt.data.minted && <span>· soulbound mint is operator-issued</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </StatePanel>
    </div>
  );
}
