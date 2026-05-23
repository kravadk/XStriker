import { useState } from 'react';
import { cn } from '@shared/utils/format';
import { getTeamMeta } from '@shared/lib/teamMeta';

export function TeamLogo({
  code,
  name,
  size = 'md',
  showEmoji: _showEmoji,
  className,
}: {
  code?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  showEmoji?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const meta = getTeamMeta(code, name);
  const sizes = size === 'sm' ? 'h-8 w-8 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-sm' : 'h-11 w-11 text-xs';

  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-[#0A0A0A] font-extrabold text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)]',
        sizes,
        className,
      )}
      title={meta.name}
      aria-label={meta.name}
    >
      {meta.flagUrl && !failed ? (
        <img
          src={meta.flagUrl}
          alt={meta.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span
            className="absolute inset-0 opacity-80"
            style={{ background: `linear-gradient(145deg, ${meta.primary} 0%, ${meta.secondary} 100%)` }}
          />
          <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{meta.code.slice(0, 3)}</span>
        </>
      )}
    </div>
  );
}
