import { AnimatedNumber } from '@shared/common/AnimatedNumber';

interface Props {
  /** Score 0..100+ — fills the ring proportionally (clamped to 100) */
  score: number;
  /** Tier label e.g. "GOLD" / "ELITE" */
  tierLabel: string;
  /** Render at this px size (square). Default 180 */
  size?: number;
}

function strokeForTier(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('elite')) return '#F6CE6E';
  if (l.includes('gold')) return '#E7B84F';
  if (l.includes('silver')) return '#C0CCDA';
  if (l.includes('bronze')) return '#B8732B';
  return '#9DA89C';
}

function glowForStroke(stroke: string): string {
  return stroke + '70';
}

export function XCupTierRing({ score, tierLabel, size = 180 }: Props) {
  const stroke = strokeForTier(tierLabel);
  const glow = glowForStroke(stroke);
  const radius = (size - 24) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillFraction = Math.max(0.04, Math.min(1, score / 100));
  const target = circumference * (1 - fillFraction);

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ filter: `drop-shadow(0 0 16px ${glow})` }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={10}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="ring-draw"
          style={{
            ['--ring-circumference' as string]: circumference.toString(),
            ['--ring-target' as string]: target.toString(),
            transform: `rotate(-90deg)`,
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="font-display text-stadium-text" style={{ fontSize: size * 0.26, lineHeight: 1, fontWeight: 800 }}>
          <AnimatedNumber value={Math.min(score, 999)} decimals={0} />
        </div>
        <div className="text-stadium-text-secondary text-xs tracking-widest mt-1">SCORE</div>
        <div className="text-[10px] tracking-[0.18em] uppercase mt-2" style={{ color: stroke }}>
          {tierLabel}
        </div>
      </div>
    </div>
  );
}
