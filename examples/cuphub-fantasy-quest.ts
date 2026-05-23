type Outcome = 'HOME' | 'DRAW' | 'AWAY';

declare const process: {
  env: { CUPHUB_URL?: string; CUPHUB_PAYMENT?: string; PLAYER_WALLET?: string };
  exitCode?: number;
};

interface Fixture {
  id: string;
  home: { code: string };
  away: { code: string };
  settlement: { state: string; finalOutcome?: Outcome };
}

interface Strength {
  home: { code: string; strength: number };
  away: { code: string; strength: number };
  confidence: number;
}

interface FanScore {
  wallet: string;
  score: number;
  level: 'unknown' | 'active' | 'trusted' | 'oracle-grade';
}

const CUPHUB = process.env.CUPHUB_URL ?? 'http://localhost:8787';
const PLAYER_WALLET = process.env.PLAYER_WALLET ?? '0x0E437c109A4C1e15172c4dA557E77724D7243F71';

async function cup<T>(path: string): Promise<T> {
  const headers = process.env.CUPHUB_PAYMENT ? { 'X-PAYMENT': process.env.CUPHUB_PAYMENT } : undefined;
  const res = await fetch(`${CUPHUB}${path}`, { headers });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function buildFantasyQuest() {
  const { fixtures } = await cup<{ fixtures: Fixture[] }>('/api/cup/fixtures');
  const match = fixtures[0];
  const [strength, fan] = await Promise.all([
    cup<Strength>(`/api/cup/team-strength?matchId=${match.id}`),
    cup<FanScore>(`/api/cup/fan-score?wallet=${PLAYER_WALLET}`),
  ]);

  const canClaimBasicQuest = fan.score >= 20;
  const canClaimWinnerMoment = fan.score >= 35 && match.settlement.state === 'finalized';
  const favorite = strength.home.strength >= strength.away.strength ? match.home.code : match.away.code;

  return {
    quest: `${match.home.code}/${match.away.code} fan challenge`,
    playerWallet: fan.wallet,
    fanTier: fan.level,
    recommendedTeamQuest: favorite,
    canClaimBasicQuest,
    canClaimWinnerMoment,
    reason: canClaimWinnerMoment
      ? 'FanPass threshold met and CupOracle result finalized.'
      : 'Keep winner-moment NFT locked until FanPass threshold and finalized oracle state are both satisfied.',
  };
}

buildFantasyQuest()
  .then((quest) => console.log(JSON.stringify(quest, null, 2)))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });

