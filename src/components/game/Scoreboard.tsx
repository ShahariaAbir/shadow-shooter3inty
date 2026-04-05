import { Button } from '@/components/ui/button';
import type { GameResult, GameMode } from '@/types/game';

interface ScoreboardProps {
  results: GameResult[];
  mode: GameMode;
  teamScores?: { green: number; red: number };
  roundScores?: { green: number; red: number };
  onReplay: () => void;
  onMenu: () => void;
  isHost: boolean;
}

const RANK_LABELS = ['🥇', '🥈', '🥉'];

const Scoreboard = ({ results, mode, teamScores, roundScores, onReplay, onMenu, isHost }: ScoreboardProps) => {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const mvp = sorted[0];

  const isTeamMode = mode === 'tdm' || mode === 'classic';
  const scores = mode === 'classic' ? roundScores : teamScores;
  const winner = isTeamMode && scores
    ? (scores.green >= scores.red ? 'GREEN' : 'RED')
    : null;

  const getDisplayName = (r: GameResult) => {
    if (r.name) return r.name;
    if (r.id.startsWith('bot-')) return `Bot ${r.number}`;
    return `Player ${r.number}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-4">
      {isTeamMode && scores ? (
        <>
          <h1 className={`font-display text-4xl font-black tracking-widest ${winner === 'GREEN' ? 'text-green-400' : 'text-red-400'}`}>
            {winner} TEAM WINS!
          </h1>
          <div className="flex gap-8 font-mono text-lg">
            <span className="text-green-400">GREEN: {scores.green}</span>
            <span className="text-red-400">RED: {scores.red}</span>
          </div>
          {mode === 'classic' && (
            <p className="text-muted-foreground font-mono text-xs">Classic Squad • Round Wins</p>
          )}
        </>
      ) : (
        <h1 className="font-display text-3xl font-black text-primary tracking-widest">GAME OVER</h1>
      )}

      {mvp && (
        <div className="text-center">
          <p className="text-muted-foreground font-mono text-xs">MVP</p>
          <p className="font-display text-xl" style={{ color: mvp.color }}>
            {getDisplayName(mvp)} — {mvp.score} kills
          </p>
        </div>
      )}

      <div className="w-full max-w-md space-y-1">
        <div className="flex font-mono text-xs text-muted-foreground px-3">
          <span className="w-10">RANK</span>
          <span className="flex-1">PLAYER</span>
          <span className="w-16 text-right">KILLS</span>
        </div>
        {sorted.map((r, i) => (
          <div key={r.id} className={`flex items-center px-3 py-2 rounded border ${
            i === 0 ? 'bg-primary/10 border-primary/30' : i === 1 ? 'bg-secondary/30 border-border/50' : i === 2 ? 'bg-secondary/20 border-border/50' : 'bg-secondary/10 border-border/30'
          }`}>
            <span className="w-10 font-mono text-sm">
              {i < 3 ? RANK_LABELS[i] : `#${i + 1}`}
            </span>
            <div className="flex-1 flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: r.color + '33', color: r.color, border: `1.5px solid ${r.color}` }}
              >
                {r.number}
              </div>
              <span className="font-mono text-sm" style={{ color: r.color }}>
                {getDisplayName(r)}
              </span>
              {isTeamMode && r.team && (
                <span className={`text-[10px] font-mono ${r.team === 'green' ? 'text-green-500' : 'text-red-500'}`}>
                  [{r.team.toUpperCase()}]
                </span>
              )}
            </div>
            <span className="w-16 text-right font-mono font-bold text-lg" style={{ color: r.color }}>{r.score}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-4">
        {isHost ? (
          <Button onClick={onReplay} className="font-display tracking-wider" size="lg">REPLAY</Button>
        ) : (
          <p className="text-muted-foreground font-mono text-sm animate-pulse">Waiting for host...</p>
        )}
        <Button onClick={onMenu} variant="secondary" className="font-display tracking-wider" size="lg">MENU</Button>
      </div>
    </div>
  );
};

export default Scoreboard;
