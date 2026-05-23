import { useEffect, useMemo, useState } from 'react';
import { Network, Bot, Award, ExternalLink } from 'lucide-react';
import { api } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useWalletStore } from '@shared/store/walletStore';
import { useUiStore } from '@shared/store/uiStore';
import { toast } from '@shared/store/toastStore';
import { celebrate } from '@shared/store/celebrateStore';
import { PageHeader, StatePanel } from '@xcup/components/cup/CupKit';
import { cn } from '@shared/utils/format';
import { explorerAddress } from '@shared/config/links';

type Outcome = 'HOME' | 'DRAW' | 'AWAY';

export function BracketPage() {
  const { connected, address, sendTx } = useWalletStore();
  const setConnectModalOpen = useUiStore((s) => s.setConnectModalOpen);
  const markets = useApi(() => api.markets(), []);
  const saved = useApi(
    () => (connected && address ? api.cupBracket(address) : Promise.resolve(null)),
    [connected, address],
  );
  const nft = useApi(
    () => (connected && address ? api.cupBracketNft(address) : Promise.resolve(null)),
    [connected, address],
  );
  const [mintBusy, setMintBusy] = useState(false);

  const [picks, setPicks] = useState<Record<string, Outcome>>({});
  const [busy, setBusy] = useState(false);

  // Reset the local pick sheet on any wallet change (disconnect, account
  // switch). Without this, picks made under wallet A would silently appear as
  // wallet B's picks until its saved bracket finishes loading.
  useEffect(() => {
    setPicks({});
  }, [address]);

  // Hydrate the local pick sheet from the saved bracket once it loads.
  useEffect(() => {
    if (saved.data?.bracket) setPicks(saved.data.bracket.picks);
  }, [saved.data]);

  // One row per fixture. The markets feed carries three market types per fixture
  // (1X2 / Over-Under / BTTS); a bracket only picks the match winner, so filter to
  // the 1X2 market and key picks by the underlying fixture id.
  const fixtures = useMemo(
    () => (markets.data?.markets ?? []).filter((m) => m.marketType === '1X2'),
    [markets.data],
  );

  async function mintNft() {
    const tx = nft.data?.mintTx;
    if (!tx) return;
    setMintBusy(true);
    try {
      const hash = await sendTx(tx);
      toast.success(`Bracket NFT mint submitted · ${hash.slice(0, 10)}…`);
      // Keep the button busy until the NFT state actually reflects the mint.
      await nft.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Mint failed');
    } finally {
      setMintBusy(false);
    }
  }

  async function save() {
    if (!address) return;
    setBusy(true);
    try {
      await api.saveBracket(address, picks);
      toast.success('Bracket saved');
      celebrate();
      // Keep the button busy until the saved bracket is re-fetched.
      await saved.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const you = saved.data?.you;
  const hermes = saved.data?.hermes;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        kicker="Call the whole tournament"
        title="Bracket"
        sub="Pick every fixture, save your bracket, and see how you score against Hermes."
      />

      <div className="stadium-card mb-4 flex items-center gap-4 p-4">
        <Network className="h-5 w-5 text-pitch" />
        <span className="text-sm font-bold text-stadium-text">
          You {you ? `${you.correct}/${you.scored}` : '0/0'}
        </span>
        <span className="text-xs text-stadium-text-muted">scored correct</span>
        <span className="ml-auto flex items-center gap-1.5 text-sm font-bold text-gold">
          <Bot className="h-4 w-4" /> Hermes {hermes ? `${hermes.correct}/${hermes.scored}` : '0/0'}
        </span>
      </div>

      {nft.data && (
        <div className="stadium-card mb-4 flex items-center gap-3 p-4">
          <Award className="h-5 w-5 text-gold" />
          {!nft.data.metadata.address ? (
            <span className="text-xs text-stadium-text-secondary">
              Bracket NFT mints once the contract is deployed to X Layer.
            </span>
          ) : nft.data.mintedTokenId > 0 ? (
            <a
              href={explorerAddress(nft.data.metadata.address)}
              target="_blank"
              rel="noreferrer"
              title="View the BracketNFT contract on X Layer explorer"
              className="inline-flex items-center gap-1.5 text-xs text-stadium-text hover:text-pitch hover:underline"
            >
              <span className="font-bold">Bracket NFT minted</span> · #{nft.data.mintedTokenId}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          ) : connected && nft.data.mintTx ? (
            <button
              onClick={() => void mintNft()}
              disabled={mintBusy}
              className="rounded-xl bg-gold px-4 py-1.5 text-sm font-bold text-stadium-base disabled:opacity-50"
            >
              {mintBusy ? 'Minting…' : 'Mint bracket NFT'}
            </button>
          ) : (
            <span className="text-xs text-stadium-text-secondary">Connect your wallet to mint your bracket NFT.</span>
          )}
        </div>
      )}

      {!connected && (
        <button
          onClick={() => setConnectModalOpen(true)}
          className="mb-4 w-full rounded-xl bg-pitch py-2.5 text-sm font-bold text-stadium-base"
        >
          Connect wallet to save your bracket
        </button>
      )}

      <StatePanel
        loading={markets.loading}
        error={markets.error}
        empty={fixtures.length === 0}
        emptyLabel="No fixtures available yet"
        onRetry={markets.reload}
      >
        <div className="flex flex-col gap-4">
          <div className="stadium-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-micro text-pitch">Every fixture</span>
              <span className="text-micro text-stadium-text-muted">
                {Object.keys(picks).length}/{fixtures.length} picked
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {fixtures.map((f) => (
                <div
                  key={f.cupMatchId}
                  className="flex items-center gap-2 border-b border-stadium-line/60 pb-2 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stadium-text">
                    {f.home.code} v {f.away.code}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {(['HOME', 'DRAW', 'AWAY'] as Outcome[]).map((o) => (
                      <button
                        key={o}
                        onClick={() => setPicks((p) => ({ ...p, [f.cupMatchId]: o }))}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors',
                          picks[f.cupMatchId] === o
                            ? 'border-pitch bg-pitch-bg text-stadium-text'
                            : 'border-stadium-line text-stadium-text-secondary hover:border-stadium-line-strong',
                        )}
                      >
                        {o === 'HOME' ? f.home.code : o === 'AWAY' ? f.away.code : 'DRAW'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {connected && (
            <button
              onClick={() => void save()}
              disabled={busy || Object.keys(picks).length === 0}
              className="rounded-xl bg-gold py-2.5 text-sm font-bold text-stadium-base disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save bracket'}
            </button>
          )}
        </div>
      </StatePanel>
    </div>
  );
}
