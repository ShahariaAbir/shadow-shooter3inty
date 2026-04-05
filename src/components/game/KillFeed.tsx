import { useEffect, useState } from 'react';

export interface KillFeedEntry {
  id: number;
  killerName: string;
  victimName: string;
  killerColor: string;
  victimColor: string;
  time: number;
}

interface KillFeedProps {
  entries: KillFeedEntry[];
}

const KillFeed = ({ entries }: KillFeedProps) => {
  const [, setTick] = useState(0);

  // Re-render to fade out old entries
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(iv);
  }, []);

  const now = Date.now();
  const visible = entries.filter(k => now - k.time < 5000);

  if (visible.length === 0) return null;

  return (
    <div className="absolute top-1 right-1 z-20 flex flex-col gap-0.5 pointer-events-none" style={{ maxWidth: '35%' }}>
      {visible.map(k => {
        const age = (now - k.time) / 5000;
        return (
          <div
            key={k.id}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-border/30"
            style={{ opacity: 1 - age * 0.8 }}
          >
            <span className="font-mono text-xs font-bold truncate" style={{ color: k.killerColor }}>
              {k.killerName}
            </span>
            <span className="font-mono text-xs text-muted-foreground shrink-0">►</span>
            <span className="font-mono text-xs font-bold truncate" style={{ color: k.victimColor }}>
              {k.victimName}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default KillFeed;
