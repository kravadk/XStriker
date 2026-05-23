import { Bot, Twitter } from 'lucide-react';
import { api, type PunditPickDto } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';
import { useUiStore } from '@shared/store/uiStore';
import { MatchupHeader, PageHeader, StatePanel } from '@xcup/components/cup/CupKit';
import { cn } from '@shared/utils/format';

const PICK_COLOR: Record<PunditPickDto['pick'], string> = {
  HOME: 'var(--color-outcome-home)',
  DRAW: 'var(--color-outcome-draw)',
  AWAY: 'var(--color-outcome-away)',
  PASS: 'var(--color-stadium-text-muted)',
};

export function PunditPage() {
  const { data, loading, error, reload } = useApi(() => api.cupPundit(), []);
  const xPosts = useApi(() => api.cupPunditXPosts(), []);
  const openMarket = useUiStore((s) => s.openMarket);

  const profile = data?.profile;
  const picks = data?.picks ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        kicker="Autonomous opponent"
        title="Hermes — AI Pundit"
        sub="An autonomous agent that reads every fixture, issues a conviction-weighted pick, and is built to be beaten."
      />

      <div className="stadium-card pitch-stripes mb-5 flex items-center gap-4 p-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gold-bg ring-1 ring-gold-border">
          <Bot className="h-8 w-8 text-gold" />
        </div>
        <div className="flex-1">
          <div className="font-display text-2xl tracking-wide text-stadium-text">{profile?.name ?? 'HERMES'}</div>
          <div className="text-xs text-stadium-text-secondary">{profile?.bio ?? 'Autonomous football pundit.'}</div>
        </div>
        <div className="text-right">
          <div className="text-micro text-stadium-text-muted">Engine</div>
          <div className="font-mono text-xs text-stadium-text">
            {profile?.mode === 'hermes-claude' ? 'Claude' : 'Heuristic'}
          </div>
        </div>
      </div>

      <div className="mb-3 text-micro text-pitch">Open picks</div>
      <StatePanel
        loading={loading}
        error={error}
        empty={picks.length === 0}
        emptyLabel="No upcoming fixtures to read"
        onRetry={reload}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {picks.map((p) => (
            <button
              key={p.matchId}
              onClick={() => openMarket(p.matchId)}
              className="stadium-card stadium-card-hover flex flex-col gap-3 p-4 text-left"
            >
              <MatchupHeader home={p.home} away={p.away} size="sm" kickoffUtc={p.kickoffUtc} />
              <div className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5 text-gold" />
                <span className="font-display text-base tracking-wide" style={{ color: PICK_COLOR[p.pick] }}>
                  {p.pick === 'PASS' ? 'NO PICK' : p.pick}
                </span>
                <span className="ml-auto rounded bg-gold-bg px-2 py-0.5 text-[10px] font-bold tabular text-gold">
                  conv {p.conviction.toFixed(2)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-stadium-text-secondary">{p.take}</p>
              <div className="mt-auto border-t border-stadium-line pt-2">
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider',
                    p.source === 'hermes-claude' ? 'text-pitch' : 'text-stadium-text-muted',
                  )}
                >
                  {p.source === 'hermes-claude' ? '⚡ Claude verdict' : 'Model heuristic'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </StatePanel>
      <div className="stadium-card mt-4 p-4">
        <div className="mb-3 flex items-center gap-2 text-micro text-pitch">
          <Twitter className="h-3.5 w-3.5" /> Hermes on X
        </div>
        {xPosts.data && xPosts.data.posts.filter((p) => p.status === 'posted').length > 0 ? (
          <div className="flex flex-col gap-2">
            {xPosts.data.posts
              .filter((p) => p.status === 'posted')
              .slice(0, 6)
              .map((p) => (
                <div key={p.createdAt} className="rounded-lg border border-stadium-line px-3 py-2">
                  <p className="whitespace-pre-line text-xs text-stadium-text-secondary">{p.text}</p>
                  {p.tweetId && (
                    <a
                      href={`https://x.com/i/web/status/${p.tweetId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[10px] font-bold text-pitch hover:underline"
                    >
                      view on X ↗
                    </a>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <div className="text-xs text-stadium-text-muted">
            No posts yet — Hermes posts here after each verified on-chain stake.
          </div>
        )}
      </div>
    </div>
  );
}
