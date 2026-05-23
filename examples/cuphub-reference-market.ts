type Outcome = 'HOME' | 'DRAW' | 'AWAY';

declare const process: {
  env: { CUPHUB_URL?: string; CUPHUB_PAYMENT?: string };
  exitCode?: number;
};

interface Fixture {
  id: string;
  home: { code: string };
  away: { code: string };
}

interface Edge {
  matchId: string;
  fairProbability: Record<'home' | 'draw' | 'away', number>;
  edge: Outcome | 'NO_TRADE';
  confidence: number;
}

interface Result {
  matchId: string;
  settlement: {
    state: string;
    finalOutcome?: Outcome;
    proposedOutcome?: Outcome;
    sourceHash: string;
  };
  onchain?: { registered: boolean; state?: number; finalOutcome?: number };
}

const CUPHUB = process.env.CUPHUB_URL ?? 'http://localhost:8787';

async function cup<T>(path: string): Promise<T> {
  const headers = process.env.CUPHUB_PAYMENT ? { 'X-PAYMENT': process.env.CUPHUB_PAYMENT } : undefined;
  const res = await fetch(`${CUPHUB}${path}`, { headers });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function buildMiniMarket() {
  const { fixtures } = await cup<{ fixtures: Fixture[] }>('/api/cup/fixtures');
  const match = fixtures[0];
  const edge = await cup<Edge>(`/api/cup/ai-edge?matchId=${match.id}`);
  const result = await cup<Result>(`/api/cup/result/${match.id}`);

  return {
    title: `${match.home.code} vs ${match.away.code}`,
    prices: {
      HOME: edge.fairProbability.home,
      DRAW: edge.fairProbability.draw,
      AWAY: edge.fairProbability.away,
    },
    suggestedOutcome: edge.edge,
    confidence: edge.confidence,
    settlementState: result.settlement.state,
    canonicalOutcome: result.settlement.finalOutcome ?? result.settlement.proposedOutcome ?? null,
    proof: result.settlement.sourceHash,
  };
}

buildMiniMarket()
  .then((market) => console.log(JSON.stringify(market, null, 2)))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
