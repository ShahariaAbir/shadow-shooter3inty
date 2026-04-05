import { useState } from 'react';
import { Swords, TrendingUp, Star, LogOut, Play, Loader2 } from 'lucide-react';
import { computeKD } from '@/lib/insforge';
import type { PlayerStats } from '@/lib/insforge';

interface DashboardProps {
  user: { name: string; email: string };
  stats: PlayerStats | null;
  hasPendingMatchmakingPenalty: boolean;
  onSignOut: () => void;
  onMatchMake: (mode: string, size: string) => void;
  onOfflinePlay: () => void;
  onEditName: (newName: string) => Promise<void>;
}

export default function Dashboard({ user, stats, hasPendingMatchmakingPenalty, onSignOut, onMatchMake, onOfflinePlay, onEditName }: DashboardProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchMode, setMatchMode] = useState<'classic' | 'tdm'>('classic');
  const [teamSize, setTeamSize] = useState<'duo' | 'squad'>('squad');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.name);

  const rawKD = stats ? Number(computeKD(stats.total_kills, stats.total_deaths)) : 0;
  const hasPenalty = hasPendingMatchmakingPenalty && rawKD > 0.1;
  const kd = Math.max(rawKD - (hasPenalty ? 0.1 : 0), 0).toFixed(2);
  const level = stats?.level ?? 1;
  const xp = stats?.xp ?? 0;
  const xpForNextLevel = level * 100;
  const xpProgress = ((xp % 100) / 100) * 100;

  const handleSignOut = async () => {
    setSigningOut(true);
    await onSignOut();
    setSigningOut(false);
  };

  const handleSaveName = async () => {
    if (editedName.trim() && editedName !== user.name) {
      await onEditName(editedName.trim());
    }
    setIsEditingName(false);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* User header */}
      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-background"
            style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  className="bg-transparent border-b border-primary/50 text-foreground font-semibold text-sm outline-none w-full"
                  maxLength={15}
                />
                <button onClick={handleSaveName} className="text-primary hover:text-primary/80">
                  <span className="text-xs">💾</span>
                </button>
              </div>
            ) : (
              <p 
                className="text-foreground font-semibold text-sm leading-tight cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                onClick={() => setIsEditingName(true)}
              >
                {user.name} <span className="opacity-50 text-[10px]">✏️</span>
              </p>
            )}
            <p className="text-muted-foreground font-mono text-[10px] break-all max-w-[150px]">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10"
          title="Sign out"
        >
          {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        </button>
      </div>

      {/* Level + XP bar */}
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Star className="w-4 h-4 text-yellow-400" />
            <span className="text-foreground font-bold text-sm">Level {level}</span>
          </div>
          <span className="text-muted-foreground font-mono text-[10px]">{xp % 100} / 100 XP</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${xpProgress}%`,
              background: 'linear-gradient(90deg, #00ff88, #00cc6a)',
            }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Swords className="w-4 h-4" />}
          label="K/D"
          value={kd}
          color="#00ff88"
          glow
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="KILLS"
          value={stats?.total_kills ?? 0}
          color="#ffdd00"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-green-400" />}
          label="WINS"
          value={stats?.wins ?? 0}
          color="#00eeaa"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 rotate-180 text-red-500" />}
          label="LOSSES"
          value={stats?.losses ?? 0}
          color="#ff4466"
        />
      </div>

      <p className="text-muted-foreground/50 font-mono text-[10px] text-center -mt-1">
        {stats?.matches_played ?? 0} matches played
      </p>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShowMatchModal(true)}
          className="h-12 w-full rounded-xl font-display tracking-[0.25em] text-sm font-bold text-background flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
            boxShadow: '0 0 24px rgba(0,255,136,0.4)',
          }}
        >
          <Swords className="w-4 h-4" />
          FIND MATCH
        </button>
        <button
          onClick={onOfflinePlay}
          className="h-10 w-full rounded-xl font-display tracking-wider text-xs font-bold text-muted-foreground border border-white/10 hover:border-white/20 hover:text-foreground transition-all flex items-center justify-center gap-2"
        >
          <Play className="w-3.5 h-3.5" />
          PLAY OFFLINE
        </button>
      </div>

      {showMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f1720] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden flex flex-col slide-in-from-bottom-5 animate-in fade-in">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-white font-display font-bold tracking-widest text-lg">MATCH SETTINGS</h2>
              <button onClick={() => setShowMatchModal(false)} className="text-white/50 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-6">
              {/* Game Mode */}
              <div className="space-y-3">
                <p className="text-white/60 font-mono text-xs">SELECT MODE</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMatchMode('classic')}
                    className={`flex flex-col items-center justify-center py-4 rounded-xl border ${matchMode === 'classic' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm mb-1 mt-1">CLASSIC SQUAD</span>
                    <span className="text-[10px] font-mono opacity-60">Round Based</span>
                  </button>
                  <button
                    onClick={() => setMatchMode('tdm')}
                    className={`flex flex-col items-center justify-center py-4 rounded-xl border ${matchMode === 'tdm' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm mb-1 mt-1">TEAM DEATHMATCH</span>
                    <span className="text-[10px] font-mono opacity-60">Time Based</span>
                  </button>
                </div>
              </div>

              {/* Team Size */}
              <div className="space-y-3">
                <p className="text-white/60 font-mono text-xs">TEAM SIZE</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setTeamSize('duo')}
                    className={`flex flex-col items-center justify-center py-3 rounded-xl border ${teamSize === 'duo' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm">DUO</span>
                    <span className="text-[10px] font-mono opacity-60">2 vs 2</span>
                  </button>
                  <button
                    onClick={() => setTeamSize('squad')}
                    className={`flex flex-col items-center justify-center py-3 rounded-xl border ${teamSize === 'squad' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm">SQUAD</span>
                    <span className="text-[10px] font-mono opacity-60">4 vs 4</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 pt-2">
              <button
                onClick={() => {
                  setShowMatchModal(false);
                  onMatchMake(matchMode, teamSize);
                }}
                className="w-full py-4 rounded-xl font-display font-black tracking-[0.2em] text-black bg-white"
                style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}
              >
                START SEARCH
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, color, glow = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  glow?: boolean;
}) {
  return (
    <div
      className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 flex flex-col items-center gap-1"
      style={glow ? { boxShadow: `0 0 16px ${color}22` } : {}}
    >
      <span style={{ color }} className="opacity-80">{icon}</span>
      <span className="text-foreground font-bold text-base" style={glow ? { color } : {}}>{value}</span>
      <span className="text-muted-foreground font-mono text-[9px] tracking-wider">{label}</span>
    </div>
  );
}
