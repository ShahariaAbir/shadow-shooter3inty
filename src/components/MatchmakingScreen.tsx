import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';

// List of bot usernames that appear in matchmaking
export const MATCHMAKING_BOT_NAMES = [
  // Original 20
  'ShadowWolf', 'NightHawk', 'PhantomX', 'VenomStrike', 'BladeRunner',
  'IronFist', 'DarkRaven', 'StormBreaker', 'CobaltGhost', 'NeonAssassin',
  'SilentKiller', 'RedViper', 'CrimsonBlaze', 'SteelPhantom', 'DarkMatter',
  'VoidWalker', 'GhostReaper', 'ShadowByte', 'NightBane', 'IceBreaker',
  // New 30 names
  'QuantumShade', 'FrostReaper', 'ThunderClad', 'AcidRain', 'NullVoid',
  'BlazeHunter', 'NebulaStrike', 'ZeroKelvin', 'ToxicFlare', 'PixelKnight',
  'RogueCircuit', 'AlphaSniper', 'ObsidianBolt', 'NightCrawlr', 'HexBreaker',
  'InfernoWrath', 'GlitchKing', 'SpecterX', 'CorvusSteel', 'PolarEdge',
  'LunarWarden', 'SolarDecay', 'CipherGhost', 'WraithByte', 'MoltenCore',
  'SerpentPact', 'EmberFang', 'OmegaDrift', 'ShardBane', 'AbyssalCrow',
];

interface MatchmakingScreenProps {
  onMatchFound: () => void;
}

// Generate natural-feeling delays — short bursts with occasional pauses
function generateNaturalDelays(count: number): number[] {
  const delays: number[] = [];
  let elapsed = 0;

  for (let i = 0; i < count; i++) {
    // Base wait: 500–1400ms, with occasional longer "searching" pauses
    const isLongPause = Math.random() < 0.25; // 25% chance of a longer gap
    const wait = isLongPause
      ? 1200 + Math.random() * 900   // 1200–2100ms
      : 500 + Math.random() * 900;   // 500–1400ms
    elapsed += wait;
    delays.push(elapsed);
  }

  return delays;
}

export default function MatchmakingScreen({ onMatchFound }: MatchmakingScreenProps) {
  const [playersFound, setPlayersFound] = useState(1);
  const [matchedNames, setMatchedNames] = useState<string[]>([]);
  const [dots, setDots] = useState('');
  const [phase, setPhase] = useState<'searching' | 'found'>('searching');

  useEffect(() => {
    // Animate dots
    const dotInterval = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'));
    }, 400);

    // Pick 3 random opponents from the pool
    const shuffled = [...MATCHMAKING_BOT_NAMES].sort(() => Math.random() - 0.5);
    const targetCount = 4; // 1 (you) + 3 opponents
    const opponents = shuffled.slice(0, targetCount - 1);

    // Generate natural delays for each opponent joining
    const delays = generateNaturalDelays(opponents.length);

    const addPlayerTimeouts: ReturnType<typeof setTimeout>[] = [];
    opponents.forEach((name, i) => {
      const t = setTimeout(() => {
        setMatchedNames(prev => [...prev, name]);
        setPlayersFound(prev => prev + 1);
      }, delays[i]);
      addPlayerTimeouts.push(t);
    });

    // Match found 800–1200ms after last player joins
    const lastDelay = delays[delays.length - 1];
    const finalPause = 800 + Math.random() * 400;
    const matchTimeout = setTimeout(() => {
      setPhase('found');
      setTimeout(() => onMatchFound(), 1000);
    }, lastDelay + finalPause);

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
