import { X, LogOut, ArrowLeft, Play, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlayerData } from '@/types/game';

interface PlayerStats {
  id: string;
  name: string;
  color: string;
  team?: 'green' | 'red';
  kills: number;
  deaths: number;
  alive: boolean;
}

interface PauseMenuProps {
  players: PlayerStats[];
  onResume: () => void;
  onExitGame: () => void;
  onBackToLobby?: () => void;
  isSolo: boolean;
}

const PauseMenu = ({ players, onResume, onExitGame, onBackToLobby, isSolo }: PauseMenuProps) => {
  const sorted = [...players].sort((a, b) => b.kills - a.kills);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-4 space-y-3 shadow-2xl mx-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-primary tracking-widest flex items-center gap-2">
            <Trophy className="w-4 h-4" /> SCOREBOARD
          </h2>
          <button onClick={onResume} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats table */}
        <div className="space-y-0.5 max-h-[40vh] overflow-y-auto">
          <div className="flex font-mono text-[9px] text-muted-foreground px-2 py-1">
            <span className="w-6">#</span>
            <span className="flex-1">PLAYER</span>
            <span className="w-12 text-center">KILLS</span>
            <span className="w-12 text-center">DEATHS</span>
            <span className="w-10 text-center">K/D</span>
          </div>
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center px-2 py-1.5 rounded text-xs font-mono border ${
                !p.alive ? 'opacity-50' : ''
              } ${i === 0 ? 'bg-primary/10 border-primary/30' : 'bg-secondary/10 border-border/30'}`}
            >
              <span className="w-6 text-muted-foreground">{i + 1}</span>
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: p.color + '44', border: `1.5px solid ${p.color}` }}
                />
                <span className="truncate" style={{ color: p.color }}>{p.name}</span>
                {p.team && (
                  <span className={`text-[8px] ${p.team === 'green' ? 'text-green-500' : 'text-red-500'}`}>
                    [{p.team.toUpperCase()}]
                  </span>
                )}
              </div>
              <span className="w-12 text-center font-bold" style={{ color: p.color }}>{p.kills}</span>
              <span className="w-12 text-center text-muted-foreground">{p.deaths}</span>
              <span className="w-10 text-center text-muted-foreground">
                {p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(1)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={onResume} className="w-full h-10 font-display tracking-wider text-sm">
            <Play className="w-4 h-4 mr-2" /> RESUME
          </Button>
          {onBackToLobby && !isSolo && (
            <Button onClick={onBackToLobby} variant="secondary" className="w-full h-9 font-display tracking-wider text-xs">
              <ArrowLeft className="w-3 h-3 mr-1" /> BACK TO LOBBY
            </Button>
          )}
          <Button onClick={onExitGame} variant="destructive" className="w-full h-9 font-display tracking-wider text-xs">
            <LogOut className="w-3 h-3 mr-1" /> EXIT GAME
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;
