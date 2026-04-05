import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';

// List of bot usernames that appear in matchmaking
export const MATCHMAKING_BOT_NAMES = [
  'ShadowWolf', 'NightHawk', 'PhantomX', 'VenomStrike', 'BladeRunner',
  'IronFist', 'DarkRaven', 'StormBreaker', 'CobaltGhost', 'NeonAssassin',
  'SilentKiller', 'RedViper', 'CrimsonBlaze', 'SteelPhantom', 'DarkMatter',
  'VoidWalker', 'GhostReaper', 'ShadowByte', 'NightBane', 'IceBreaker',
];

interface MatchmakingScreenProps {
  onMatchFound: () => void;
}

export default function MatchmakingScreen({ onMatchFound }: MatchmakingScreenProps) {
  const [playersFound, setPlayersFound] = useState(1);
  const [matchedNames, setMatchedNames] = useState<string[]>([]);
  const [dots, setDots] = useState('');
  const [phase, setPhase] = useState<'searching' | 'found'>('searching');

  useEffect(() => {
    // Animate dots
    const dotInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);

    // Simulate finding players (bots) over 3-5 seconds
    const shuffled = [...MATCHMAKING_BOT_NAMES].sort(() => Math.random() - 0.5);
    const targetCount = 4; // We'll "find" 3 opponents (t1, t2, t3, t4 bots)

    const addPlayerTimeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < targetCount - 1; i++) {
      const delay = 600 + i * 700 + Math.random() * 400;
      const t = setTimeout(() => {
        setMatchedNames(prev => [...prev, shuffled[i]]);
        setPlayersFound(prev => prev + 1);
      }, delay);
      addPlayerTimeouts.push(t);
    }

    // Match found after all "players" join
    const matchTimeout = setTimeout(() => {
      setPhase('found');
      setTimeout(() => onMatchFound(), 1000);
    }, 600 + (targetCount - 1) * 700 + 800);

    return () => {
      clearInterval(dotInterval);
      addPlayerTimeouts.forEach(clearTimeout);
      clearTimeout(matchTimeout);
    };
  }, [onMatchFound]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: 'radial-gradient(ellipse at center, #0d1f15 0%, #080d16 100%)' }}
    >
      {/* Pulsing ring */}
      <div className="relative flex items-center justify-center mb-8">
        <div
          className="absolute w-32 h-32 rounded-full border-2 border-primary/20 animate-ping"
          style={{ animationDuration: '2s' }}
        />
        <div
          className="absolute w-24 h-24 rounded-full border border-primary/30 animate-ping"
          style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}
        />
        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center">
          {phase === 'found' ? (
            <Users className="w-7 h-7 text-primary" />
          ) : (
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          )}
        </div>
      </div>

      {phase === 'searching' ? (
        <>
          <h2 className="text-foreground font-display font-black text-2xl tracking-[0.3em] mb-1">
            FINDING MATCH
          </h2>
          <p className="text-muted-foreground font-mono text-sm mb-6">
            Searching for players{dots}
          </p>

          {/* Player count */}
          <div className="bg-white/5 border border-white/10 rounded-xl px-6 py-3 mb-4">
            <p className="text-center font-mono text-xs text-muted-foreground mb-1">PLAYERS FOUND</p>
            <p className="text-center font-bold text-2xl text-primary">{playersFound} / 4</p>
          </div>

          {/* Matched player names */}
          <div className="flex flex-col gap-1.5 w-64">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-primary font-mono text-xs font-semibold">You</span>
            </div>
            {matchedNames.map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg animate-in fade-in slide-in-from-left-2 duration-300"
              >
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-muted-foreground font-mono text-xs">{name}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2
            className="text-primary font-display font-black text-3xl tracking-[0.3em]"
            style={{ textShadow: '0 0 30px rgba(0,255,136,0.6)' }}
          >
            MATCH FOUND!
          </h2>
          <p className="text-muted-foreground font-mono text-sm mt-2">Starting game...</p>
        </>
      )}
    </div>
  );
}
