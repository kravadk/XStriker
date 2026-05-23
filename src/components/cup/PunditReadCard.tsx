import { Bot } from 'lucide-react';
import { api } from '@shared/api/client';
import { useApi } from '@shared/hooks/useApi';

/**
 * The genuine per-match AI read — a Claude-backed pundit verdict (with an honest
 * heuristic fallback when no AI key is configured). Replaces the heuristic edge card.
 */
export function PunditReadCard({ matchId }: { matchId: string }) {
  const { data, loading } = useApi(() => api.cupPunditPick(matchId), [matchId]);

  if (loading) {
    return <div className="stadium-card p-4 text-xs text-stadium-text-muted">Hermes is reading the fixture…</div>;
  }
  if (!data) return null;

  const isLlm = data.source === 'hermes-claude';
  return (
    <div className="stadium-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Bot className="h-4 w-4 text-gold" />
        <span className="text-sm font-bold text-stadium-text">Hermes — AI pundit read</span>
        <span className="ml-auto rounded bg-gold-bg px-2 py-0.5 text-[10px] font-bold text-gold">
          {data.pick} · conv {data.conviction.toFixed(2)}
        </span>
      </div>
      <p className="mb-2 text-xs text-stadium-text-secondary">{data.take}</p>
      {data.keyFactors.length > 0 && (
        <ul className="space-y-1 text-xs text-stadium-text-secondary">
          {data.keyFactors.map((k, i) => (
            <li key={i}>· {k}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-[10px] uppercase tracking-wider text-stadium-text-muted">
        {isLlm ? 'Claude-backed read' : 'heuristic fallback — no AI key configured'}
      </div>
    </div>
  );
}
