import { useState } from 'react';
import { Swords, TrendingUp, Star, LogOut, Play, Loader2, Bomb, Coins, ShoppingCart } from 'lucide-react';
import { computeKD } from '@/lib/insforge';
import type { PlayerStats } from '@/lib/insforge';
import { ECONOMY_CONFIG } from '@/lib/economy';

interface DashboardProps {
  user: { name: string; email: string };
  stats: PlayerStats | null;
  hasPendingMatchmakingPenalty: boolean;
  onSignOut: () => void;
  onMatchMake: (mode: string, size: string) => void;
  onOfflinePlay: () => void;
  onEditName: (newName: string) => Promise<void>;
  onBuyGrenades: () => Promise<{ ok: boolean; reason?: string }>;
  onOpenStore: () => void;
}

export default function Dashboard({ user, stats, hasPendingMatchmakingPenalty, onSignOut, onMatchMake, onOfflinePlay, onEditName, onBuyGrenades, onOpenStore }: DashboardProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchMode, setMatchMode] = useState<'classic' | 'tdm'>('classic');
  const [teamSize, setTeamSize] = useState<'duo' | 'squad'>('squad');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.name);
  const [buyingGrenade, setBuyingGrenade] = useState(false);
  const [shopMsg, setShopMsg] = useState<string>('');

  const rawKD = stats ? Number(computeKD(stats.total_kills, stats.total_deaths)) : 0;
  const hasPenalty = hasPendingMatchmakingPenalty && rawKD > 0.1;
  const kd = Math.max(rawKD - (hasPenalty ? 0.1 : 0), 0).toFixed(2);
  const level = stats?.level ?? 1;
  const xp = stats?.xp ?? 0;
  const xpForNextLevel = level * 100;
  const xpProgress = ((xp % 100) / 100) * 100;
  const coins = stats?.coins ?? 0;
  const grenadesOwned = stats?.grenades_owned ?? 0;

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

  const handleBuyGrenades = async () => {
    setBuyingGrenade(true);
    const result = await onBuyGrenades();
    setShopMsg(result.ok ? `Purchased +${ECONOMY_CONFIG.grenadeBundleSize} grenade.` : (result.reason || 'Purchase failed'));
    setBuyingGrenade(false);
  };

  return (
    <>
      {/* Portrait Layout */}
      <div className="landscape:hidden flex flex-col gap-4 w-full">
        <PortraitContent
          user={user}
          isEditingName={isEditingName}
          editedName={editedName}
          setEditedName={setEditedName}
          setIsEditingName={setIsEditingName}
          handleSaveName={handleSaveName}
          signingOut={signingOut}
          handleSignOut={handleSignOut}
          level={level}
          xp={xp}
          xpProgress={xpProgress}
          kd={kd}
          stats={stats}
          coins={coins}
          grenadesOwned={grenadesOwned}
          buyingGrenade={buyingGrenade}
          handleBuyGrenades={handleBuyGrenades}
          shopMsg={shopMsg}
          onOpenStore={onOpenStore}
          setShowMatchModal={setShowMatchModal}
          onOfflinePlay={onOfflinePlay}
        />
      </div>

      {/* Landscape Layout - Fullscreen Game Hub Style */}
      <div className="hidden landscape:flex w-full h-screen overflow-hidden p-3 bg-gradient-to-br from-[#0a0f1a] to-[#0c111c]">
        {/* Left Panel - Hero Stats & Actions */}
        <div className="w-[32%] flex flex-col gap-3 pr-3 border-r border-white/10">
          {/* User Profile Card */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-black shadow-lg"
                    style={{ background: 'linear-gradient(145deg, #00ff88, #00cc6a)' }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-black/50"></div>
                </div>
                <div>
                  {isEditingName ? (
                    <div className="flex items-center gap-2 bg-black/50 rounded-lg p-1">
                      <input
                        type="text"
                        autoFocus
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        className="bg-transparent border-b border-primary/50 text-white font-bold text-sm outline-none w-28"
                        maxLength={15}
                      />
                      <button onClick={handleSaveName} className="text-primary hover:text-primary/80 text-xs bg-white/10 rounded px-2 py-0.5">Save</button>
                    </div>
                  ) : (
                    <p
                      className="text-white font-bold text-lg cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                      onClick={() => setIsEditingName(true)}
                    >
                      {user.name} <span className="opacity-50 text-[10px]">✏️</span>
                    </p>
                  )}
                  <p className="text-white/40 font-mono text-[10px] truncate max-w-[120px]">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-white/40 hover:text-red-400 transition-colors p-2 rounded-xl hover:bg-red-400/10"
              >
                {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              </button>
            </div>

            {/* XP Bar - Game style */}
            <div className="bg-black/30 rounded-full p-1">
              <div className="flex items-center justify-between text-[10px] text-white/60 mb-1 px-1">
                <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400"/> LVL {level}</span>
                <span>{xp % 100} / 100 XP</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${xpProgress}%`, background: 'linear-gradient(90deg, #00ff88, #00cc6a)' }}
                />
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatCardLarge icon={<Swords className="w-4 h-4" />} label="K/D RATIO" value={kd} color="#00ff88" />
            <StatCardLarge icon={<TrendingUp className="w-4 h-4" />} label="TOTAL KILLS" value={stats?.total_kills ?? 0} color="#ffdd00" />
            <StatCardLarge icon={<TrendingUp className="w-4 h-4 text-green-400" />} label="VICTORIES" value={stats?.wins ?? 0} color="#00eeaa" />
            <StatCardLarge icon={<TrendingUp className="w-4 h-4 rotate-180 text-red-500" />} label="DEFEATS" value={stats?.losses ?? 0} color="#ff4466" />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={onOpenStore}
              className="h-12 rounded-xl font-display tracking-wider text-xs font-bold text-yellow-200 border border-yellow-400/30 hover:border-yellow-300/60 hover:text-yellow-100 transition-all flex items-center justify-center gap-2 bg-black/20 backdrop-blur"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              WEAPON STORE
            </button>
            <button
              onClick={() => setShowMatchModal(true)}
              className="h-14 rounded-xl font-display tracking-[0.2em] text-sm font-bold text-black flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_0_15px_rgba(0,255,136,0.5)]"
              style={{
                background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
              }}
            >
              <Swords className="w-5 h-5" />
              FIND MATCH
            </button>
            <button
              onClick={onOfflinePlay}
              className="h-10 rounded-xl font-display tracking-wider text-[10px] font-bold text-white/60 border border-white/10 hover:border-white/30 hover:text-white transition-all flex items-center justify-center gap-2 bg-black/20"
            >
              <Play className="w-3.5 h-3.5" />
              PRACTICE MODE (OFFLINE)
            </button>
          </div>
        </div>

        {/* Right Panel - Economy & Utilities */}
        <div className="flex-1 flex flex-col gap-3 pl-3">
          {/* Top Resource Bar */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-r from-[#ffd16620] to-transparent rounded-xl p-3 border border-[#ffd166]/20 backdrop-blur-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-[#ffd166]" />
                <div>
                  <p className="text-white/50 text-[10px] font-mono">TOTAL COINS</p>
                  <p className="text-white font-bold text-2xl leading-tight">{coins}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/30">+{ECONOMY_CONFIG.coinsPerKill}/kill</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-[#ff4d4d20] to-transparent rounded-xl p-3 border border-[#ff4d4d]/20 backdrop-blur-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bomb className="w-6 h-6 text-[#ff4d4d]" />
                <div>
                  <p className="text-white/50 text-[10px] font-mono">EXPLOSIVES</p>
                  <p className="text-white font-bold text-2xl leading-tight">{grenadesOwned}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/30">{ECONOMY_CONFIG.grenadePriceCoins} coins each</p>
              </div>
            </div>
          </div>

          {/* Grenade Shop - Tactical Panel */}
          <div className="flex-1 bg-gradient-to-br from-white/5 to-black/20 rounded-2xl border border-white/10 backdrop-blur-sm p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold tracking-wide text-lg flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-[#ff4d4d]" />
                  BLACK MARKET
                </h3>
                <span className="text-[10px] font-mono text-white/30 bg-black/30 px-2 py-0.5 rounded">LIMITED STOCK</span>
              </div>
              <div className="bg-black/40 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <Bomb className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">M67 Frag Grenade</p>
                      <p className="text-white/40 text-[10px] font-mono">{ECONOMY_CONFIG.grenadePriceCoins} COINS</p>
                    </div>
                  </div>
                  <button
                    onClick={handleBuyGrenades}
                    disabled={buyingGrenade}
                    className="h-10 px-4 rounded-lg text-xs font-bold tracking-wide bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30 disabled:opacity-60 flex items-center gap-1 transition-all"
                  >
                    {buyingGrenade ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
                    PURCHASE
                  </button>
                </div>
              </div>
              {shopMsg && (
                <p className="text-[10px] text-green-400/80 mt-3 font-mono text-center bg-black/40 py-1 rounded animate-pulse">
                  {shopMsg}
                </p>
              )}
            </div>
            <div className="mt-4 text-center">
              <p className="text-[9px] text-white/20 font-mono">{stats?.matches_played ?? 0} COMBAT DEPLOYMENTS</p>
            </div>
          </div>
        </div>
      </div>

      {/* Match Modal */}
      {showMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0f1720] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/30">
              <h2 className="text-white font-display font-bold tracking-widest text-lg">MATCHMAKING</h2>
              <button onClick={() => setShowMatchModal(false)} className="text-white/50 hover:text-white transition-colors w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-white/50 font-mono text-xs mb-2 tracking-wider">GAME MODE</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMatchMode('classic')}
                    className={`py-3 rounded-xl border text-center transition-all ${matchMode === 'classic' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88] shadow-[0_0_10px_rgba(0,255,136,0.2)]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                  >
                    <span className="font-bold block">CLASSIC</span>
                    <span className="text-[9px] opacity-60">Round Based</span>
                  </button>
                  <button
                    onClick={() => setMatchMode('tdm')}
                    className={`py-3 rounded-xl border text-center transition-all ${matchMode === 'tdm' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88] shadow-[0_0_10px_rgba(0,255,136,0.2)]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                  >
                    <span className="font-bold block">TEAM DEATHMATCH</span>
                    <span className="text-[9px] opacity-60">Time Based</span>
                  </button>
                </div>
              </div>
              <div>
                <p className="text-white/50 font-mono text-xs mb-2 tracking-wider">TEAM SIZE</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setTeamSize('duo')}
                    className={`py-3 rounded-xl border text-center transition-all ${teamSize === 'duo' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                  >
                    <span className="font-bold block">DUO</span>
                    <span className="text-[9px] opacity-60">2 vs 2</span>
                  </button>
                  <button
                    onClick={() => setTeamSize('squad')}
                    className={`py-3 rounded-xl border text-center transition-all ${teamSize === 'squad' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                  >
                    <span className="font-bold block">SQUAD</span>
                    <span className="text-[9px] opacity-60">4 vs 4</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 pt-0">
              <button
                onClick={() => {
                  setShowMatchModal(false);
                  onMatchMake(matchMode, teamSize);
                }}
                className="w-full py-3 rounded-xl font-display font-black tracking-[0.2em] text-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}
              >
                DEPLOY
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Portrait Content Component
function PortraitContent({
  user, isEditingName, editedName, setEditedName, setIsEditingName, handleSaveName,
  signingOut, handleSignOut, level, xp, xpProgress, kd, stats, coins, grenadesOwned,
  buyingGrenade, handleBuyGrenades, shopMsg, onOpenStore, setShowMatchModal, onOfflinePlay,
}: any) {
  return (
    <>
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
                  onChange={(e: any) => setEditedName(e.target.value)}
                  onKeyDown={(e: any) => e.key === 'Enter' && handleSaveName()}
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
        >
          {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        </button>
      </div>

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
            style={{ width: `${xpProgress}%`, background: 'linear-gradient(90deg, #00ff88, #00cc6a)' }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Swords className="w-4 h-4" />} label="K/D" value={kd} color="#00ff88" glow />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="KILLS" value={stats?.total_kills ?? 0} color="#ffdd00" />
        <StatCard icon={<TrendingUp className="w-4 h-4 text-green-400" />} label="WINS" value={stats?.wins ?? 0} color="#00eeaa" />
        <StatCard icon={<TrendingUp className="w-4 h-4 rotate-180 text-red-500" />} label="LOSSES" value={stats?.losses ?? 0} color="#ff4466" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Coins className="w-4 h-4" />} label="COINS" value={coins} color="#ffd166" glow />
        <StatCard icon={<Bomb className="w-4 h-4" />} label="GRENADES" value={grenadesOwned} color="#ff4d4d" />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-foreground text-xs font-semibold">Grenade Shop</p>
            <p className="text-muted-foreground text-[10px] font-mono">
              1 kill = {ECONOMY_CONFIG.coinsPerKill} coin • {ECONOMY_CONFIG.grenadePriceCoins} coins / grenade
            </p>
          </div>
          <button
            onClick={handleBuyGrenades}
            disabled={buyingGrenade}
            className="h-9 px-3 rounded-lg text-xs font-bold tracking-wide bg-red-500/15 border border-red-400/40 text-red-300 hover:bg-red-500/25 disabled:opacity-60 flex items-center gap-1.5"
          >
            {buyingGrenade ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            BUY
          </button>
        </div>
        {shopMsg && <p className="text-[10px] text-muted-foreground mt-2 font-mono">{shopMsg}</p>}
      </div>

      <p className="text-muted-foreground/50 font-mono text-[10px] text-center -mt-1">
        {stats?.matches_played ?? 0} matches played
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={onOpenStore}
          className="h-10 w-full rounded-xl font-display tracking-wider text-xs font-bold text-yellow-200 border border-yellow-400/30 hover:border-yellow-300/60 hover:text-yellow-100 transition-all flex items-center justify-center gap-2"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          OPEN STORE
        </button>
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
    </>
  );
}

// Stat Card Component
function StatCard({
  icon, label, value, color, glow = false, landscape = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  glow?: boolean;
  landscape?: boolean;
}) {
  return (
    <div
      className={`bg-white/5 border border-white/10 rounded-xl flex flex-col items-center gap-0.5 ${landscape ? 'px-2 py-2' : 'px-3 py-2.5'}`}
      style={glow ? { boxShadow: `0 0 16px ${color}22` } : {}}
    >
      <span style={{ color }} className="opacity-80">{icon}</span>
      <span className={`text-foreground font-bold ${landscape ? 'text-sm' : 'text-base'}`} style={glow ? { color } : {}}>{value}</span>
      <span className="text-muted-foreground font-mono text-[9px] tracking-wider">{label}</span>
    </div>
  );
}

// New Large Stat Card for Landscape
function StatCardLarge({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-xl p-2 border border-white/10 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-black/30 flex items-center justify-center" style={{ color }}>
          {icon}
        </div>
        <div>
          <p className="text-white/40 text-[9px] font-mono tracking-tight">{label}</p>
          <p className="text-white font-bold text-base leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}
