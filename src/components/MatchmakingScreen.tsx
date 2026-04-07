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
  partySize?: number;
}

// Play a short "player joined" ping sound using the Web Audio API
function playJoinSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Main ping tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);          // A5
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08); // up to E6
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);

    // Subtle second harmonic for richness
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, ctx.currentTime);
    gain2.gain.setValueAtTime(0.08, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + 0.2);
  } catch {
    // Audio not available — silently skip
  }
}

// Generate random delays between 1000ms and 3000ms for each player,
// accumulated so they join one after another.
function generateRandomDelays(count: number): number[] {
  const delays: number[] = [];
  let elapsed = 0;

  for (let i = 0; i < count; i++) {
    // Random wait: 1000–3000ms (1–3 seconds)
    const wait = 1000 + Math.random() * 2000;
    elapsed += wait;
    delays.push(elapsed);
  }

  return delays;
}

export default function MatchmakingScreen({ onMatchFound, partySize = 1 }: MatchmakingScreenProps) {
  const [playersFound, setPlayersFound] = useState(Math.max(1, partySize));
  const [matchedNames, setMatchedNames] = useState<string[]>([]);
  const [dots, setDots] = useState('');
  const [phase, setPhase] = useState<'searching' | 'found'>('searching');

  useEffect(() => {
    setPlayersFound(Math.max(1, partySize));
    setMatchedNames([]);
  }, [partySize]);

  useEffect(() => {
    // Animate dots
    const dotInterval = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'));
    }, 400);

    // Pick 3 random opponents from the pool
    const shuffled = [...MATCHMAKING_BOT_NAMES].sort(() => Math.random() - 0.5);
    const targetCount = 4; // team of 4 for matchmaking list
    const opponents = shuffled.slice(0, Math.max(0, targetCount - partySize));

    // Generate random 1–3 second delays for each opponent joining
    const delays = generateRandomDelays(opponents.length);

    const addPlayerTimeouts: ReturnType<typeof setTimeout>[] = [];
    opponents.forEach((name, i) => {
      const t = setTimeout(() => {
        setMatchedNames(prev => [...prev, name]);
        setPlayersFound(prev => prev + 1);
        playJoinSound();
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
  }, [onMatchFound, partySize]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 overflow-y-auto px-4 py-8"
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
              <span className="text-primary font-mono text-xs font-semibold">You {partySize > 1 ? `(Party ${partySize})` : ''}</span>
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
