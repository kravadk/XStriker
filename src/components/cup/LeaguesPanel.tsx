import { useState } from 'react';
import { Users, Plus, LogIn, Bot, User as UserIcon } from 'lucide-react';
import { api } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useWalletStore } from '@shared/store/walletStore';
import { useUiStore } from '@shared/store/uiStore';
import { toast } from '@shared/store/toastStore';
import { explorerAddress } from '@shared/config/links';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function shortWallet(w: string): string {
  return w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

/** Friend-leagues view: create, join by code, list your leagues, expand a league board. */
export function LeaguesPanel() {
  const { connected, address } = useWalletStore();
  const setConnectModalOpen = useUiStore((s) => s.setConnectModalOpen);
  const leagues = useApi(
    () => (connected && address ? api.cupLeagues(address) : Promise.resolve({ leagues: [] })),
    [connected, address],
  );
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const board = useApi(
    () => (openId ? api.cupLeagueLeaderboard(openId) : Promise.resolve(null)),
    [openId],
  );

  if (!connected || !address) {
    return (
      <div className="stadium-card p-8 text-center">
        <Users className="mx-auto mb-2 h-7 w-7 text-pitch" />
        <div className="mb-3 text-sm text-stadium-text-secondary">
          Connect your wallet to create or join a friend league.
        </div>
        <button
          onClick={() => setConnectModalOpen(true)}
          className="rounded-xl bg-pitch px-4 py-2 text-sm font-bold text-stadium-base"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  async function create() {
    setBusy(true);
    try {
      const res = await api.createLeague(name.trim(), address!);
      toast.success(`League created — code ${res.league.inviteCode}`);
      setName('');
      leagues.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    try {
      await api.joinLeague(code.trim(), address!);
      toast.success('Joined league');
      setCode('');
      leagues.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Join failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="stadium-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-stadium-text">
            <Plus className="h-4 w-4 text-pitch" /> Create a league
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="League name"
            className="w-full rounded-lg border border-stadium-line bg-stadium-base px-3 py-2 text-sm text-stadium-text outline-none focus:border-pitch-border"
          />
          <button
            onClick={() => void create()}
            disabled={busy || name.trim().length < 3}
            className="mt-2 w-full rounded-xl bg-pitch py-2 text-sm font-bold text-stadium-base disabled:opacity-50"
          >
            Create
          </button>
        </div>
        <div className="stadium-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-stadium-text">
            <LogIn className="h-4 w-4 text-pitch" /> Join with a code
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="INVITE CODE"
            className="w-full rounded-lg border border-stadium-line bg-stadium-base px-3 py-2 font-mono text-sm text-stadium-text outline-none focus:border-pitch-border"
          />
          <button
            onClick={() => void join()}
            disabled={busy || code.trim().length < 4}
            className="mt-2 w-full rounded-xl border border-stadium-line-strong py-2 text-sm font-bold text-stadium-text disabled:opacity-50"
          >
            Join
          </button>
        </div>
      </div>

      {leagues.data && leagues.data.leagues.length === 0 && (
        <div className="stadium-card p-6 text-center text-xs text-stadium-text-secondary">
          You are not in any league yet — create one and share its code with friends.
        </div>
      )}

      {leagues.data?.leagues.map((lg) => (
        <div key={lg.id} className="stadium-card p-4">
          <button
            onClick={() => setOpenId(openId === lg.id ? null : lg.id)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Users className="h-4 w-4 text-pitch" />
            <span className="text-sm font-bold text-stadium-text">{lg.name}</span>
            <span className="ml-auto rounded bg-gold-bg px-2 py-0.5 font-mono text-xs text-gold">
              {lg.inviteCode}
            </span>
            <span className="text-[10px] text-stadium-text-muted">{lg.members.length} members</span>
          </button>
          {openId === lg.id && (
            <div className="mt-3 border-t border-stadium-line pt-2">
              {board.loading && (
                <div className="py-3 text-center text-xs text-stadium-text-muted">Loading…</div>
              )}
              {board.data && board.data.rows.length === 0 && (
                <div className="py-3 text-center text-xs text-stadium-text-secondary">
                  No scored picks in this league yet.
                </div>
              )}
              <div className="divide-y divide-stadium-line">
                {board.data?.rows.map((r) => (
                  <div key={r.wallet} className="flex items-center gap-3 py-2">
                    <span className="font-display w-6 text-center text-stadium-text-muted">{r.rank}</span>
                    {r.isHermes ? (
                      <Bot className="h-4 w-4 text-gold" />
                    ) : (
                      <UserIcon className="h-4 w-4 text-stadium-text-muted" />
                    )}
                    {r.isHermes ? (
                      <span className="font-mono text-xs text-stadium-text">Hermes</span>
                    ) : (
                      <a
                        href={explorerAddress(r.wallet)}
                        target="_blank"
                        rel="noreferrer"
                        title={`View ${r.wallet} on X Layer explorer`}
                        className="font-mono text-xs text-stadium-text hover:text-pitch hover:underline"
                      >
                        {shortWallet(r.wallet)}
                      </a>
                    )}
                    <span className="ml-auto font-mono text-xs font-bold text-pitch">{pct(r.accuracy)}</span>
                    <span className="w-16 text-right font-mono text-xs font-bold text-gold">{r.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
