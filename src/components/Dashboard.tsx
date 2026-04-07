import { useEffect, useState } from 'react';
import { Swords, TrendingUp, Star, LogOut, Play, Loader2, Bomb, Coins, ShoppingCart } from 'lucide-react';
import { computeKD } from '@/lib/insforge';
import type { PlayerStats } from '@/lib/insforge';
import { ECONOMY_CONFIG } from '@/lib/economy';
import { usePeer } from '@/hooks/usePeer';

interface DashboardProps {
  user: { name: string; email: string };
  stats: PlayerStats | null;
  hasPendingMatchmakingPenalty: boolean;
  onSignOut: () => void;
  onMatchMake: (mode: string, size: string, partySize: number, partyCode?: string) => void;
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
  const [partyCode, setPartyCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [partyMembers, setPartyMembers] = useState<string[]>([user.name]);
  const [partyMsg, setPartyMsg] = useState('');
  const [isPartyHost, setIsPartyHost] = useState(true);

  const { createRoom, joinRoom, sendData, broadcast, onData, roomCode, connected, isHost, playerCount, disconnect, error } = usePeer();

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

  const handleOpenMatchModal = () => {
    setShowMatchModal(true);
    createRoom();
    setPartyCode('');
    setIsPartyHost(true);
    setPartyMembers([user.name]);
    setJoinCode('');
    setPartyMsg('');
  };

  const handleJoinByCode = () => {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setPartyMsg('Enter a valid 4-character code.');
      return;
    }
    joinRoom(code);
    setIsPartyHost(false);
    setPartyMembers([user.name]);
    setPartyMsg(`Joining ${code}...`);
    setJoinCode('');
  };

  useEffect(() => {
    onData((data: any, fromId: string) => {
      if (data?.type === 'partyHello' && isHost) {
        const nextMembers = Array.from(new Set([user.name, ...(data.members || []), data.name].filter(Boolean)));
        setPartyMembers(nextMembers);
        broadcast({ type: 'partyState', members: nextMembers });
      }
      if (data?.type === 'partyState' && Array.isArray(data.members)) {
        setPartyMembers(Array.from(new Set(data.members.filter(Boolean))));
      }
      if (data?.type === 'startSearch') {
        setShowMatchModal(false);
        onMatchMake(data.mode, data.size, data.partySize, data.partyCode);
      }
      if (data?.type === 'partyLeft' && isHost) {
        const nextMembers = Array.from(new Set([user.name, ...(data.members || [])]));
        setPartyMembers(nextMembers);
        broadcast({ type: 'partyState', members: nextMembers });
      }
      if (data?.type === 'partyMessage' && typeof data.text === 'string') {
        setPartyMsg(data.text);
      }
      if (fromId && isHost && data?.type === 'partyHelloAck') {
        // no-op; reserved for future per-peer ack flow
      }
    });
  }, [broadcast, isHost, onData, onMatchMake, partyMembers, user.name]);

  useEffect(() => {
    if (!roomCode) return;
    setPartyCode(roomCode);
  }, [roomCode]);

  useEffect(() => {
    if (error) setPartyMsg(error);
  }, [error]);

  useEffect(() => {
    if (!connected) return;
    if (isHost) {
      const hostMembers = Array.from(new Set([user.name, ...partyMembers]));
      if (hostMembers.join('|') !== partyMembers.join('|')) {
        setPartyMembers(hostMembers);
      }
      broadcast({ type: 'partyState', members: hostMembers });
    } else {
      sendData({ type: 'partyHello', name: user.name, members: [user.name] });
    }
  }, [broadcast, connected, isHost, partyMembers, sendData, user.name]);

  const closeMatchModal = () => {
    disconnect();
    setShowMatchModal(false);
  };

  const isDuoLocked = partyMembers.length > 2;
  const selectedTeamSize = isDuoLocked ? 'squad' : teamSize;

  return (
    <>
      {/* ── PORTRAIT layout (default) ── */}
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
          onOpenMatchModal={handleOpenMatchModal}
          onOfflinePlay={onOfflinePlay}
        />
      </div>

      {/* ── LANDSCAPE layout (mobile landscape — no scroll) ── */}
      <div className="hidden landscape:flex w-full h-screen overflow-hidden gap-2 p-2">

        {/* LEFT COLUMN — user info + XP + action buttons */}
        <div className="flex flex-col gap-2 w-[38%] min-w-0">

          {/* User header */}
          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-background"
                style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                {isEditingName ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                      className="bg-transparent border-b border-primary/50 text-foreground font-semibold text-xs outline-none w-full"
                      maxLength={15}
                    />
                    <button onClick={handleSaveName} className="text-primary hover:text-primary/80 shrink-0">
                      <span className="text-[10px]">💾</span>
                    </button>
                  </div>
                ) : (
                  <p
                    className="text-foreground font-semibold text-xs leading-tight cursor-pointer hover:text-primary transition-colors flex items-center gap-1 truncate"
                    onClick={() => setIsEditingName(true)}
                  >
                    {user.name} <span className="opacity-50 text-[9px]">✏️</span>
                  </p>
                )}
                <p className="text-muted-foreground font-mono text-[9px] truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10 shrink-0"
            >
              {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Level + XP bar */}
          <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400" />
                <span className="text-foreground font-bold text-xs">Level {level}</span>
              </div>
              <span className="text-muted-foreground font-mono text-[9px]">{xp % 100} / 100 XP</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${xpProgress}%`, background: 'linear-gradient(90deg, #00ff88, #00cc6a)' }}
              />
            </div>
          </div>

          {/* Matches played */}
          <p className="text-muted-foreground/50 font-mono text-[9px] text-center -mt-0.5">
            {stats?.matches_played ?? 0} matches played
          </p>

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 mt-auto">
            <button
              onClick={onOpenStore}
              className="h-8 w-full rounded-lg font-display tracking-wider text-[10px] font-bold text-yellow-200 border border-yellow-400/30 hover:border-yellow-300/60 hover:text-yellow-100 transition-all flex items-center justify-center gap-1.5"
            >
              <ShoppingCart className="w-3 h-3" />
              OPEN STORE
            </button>
            <button
              onClick={handleOpenMatchModal}
              className="h-10 w-full rounded-lg font-display tracking-[0.2em] text-xs font-bold text-background flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
                boxShadow: '0 0 20px rgba(0,255,136,0.35)',
              }}
            >
              <Swords className="w-3.5 h-3.5" />
              FIND MATCH
            </button>
            <button
              onClick={onOfflinePlay}
              className="h-8 w-full rounded-lg font-display tracking-wider text-[10px] font-bold text-muted-foreground border border-white/10 hover:border-white/20 hover:text-foreground transition-all flex items-center justify-center gap-1.5"
            >
              <Play className="w-3 h-3" />
              PLAY OFFLINE
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN — stats + grenade shop */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">

          {/* Stats grid — 4 stats in one row */}
          <div className="grid grid-cols-4 gap-1.5">
            <StatCard icon={<Swords className="w-3 h-3" />}             label="K/D"    value={kd}                     color="#00ff88" glow landscape />
            <StatCard icon={<TrendingUp className="w-3 h-3" />}         label="KILLS"  value={stats?.total_kills ?? 0} color="#ffdd00"      landscape />
            <StatCard icon={<TrendingUp className="w-3 h-3 text-green-400" />} label="WINS" value={stats?.wins ?? 0}  color="#00eeaa"      landscape />
            <StatCard icon={<TrendingUp className="w-3 h-3 rotate-180 text-red-500" />} label="LOSSES" value={stats?.losses ?? 0} color="#ff4466" landscape />
          </div>

          {/* Coins + Grenades */}
          <div className="grid grid-cols-2 gap-1.5">
            <StatCard icon={<Coins className="w-3 h-3" />} label="COINS"    value={coins}          color="#ffd166" glow landscape />
            <StatCard icon={<Bomb className="w-3 h-3" />}  label="GRENADES" value={grenadesOwned}   color="#ff4d4d"      landscape />
          </div>

          {/* Grenade shop */}
          <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-foreground text-[10px] font-semibold">Grenade Shop</p>
                <p className="text-muted-foreground text-[9px] font-mono">
                  1 kill = {ECONOMY_CONFIG.coinsPerKill} coin • {ECONOMY_CONFIG.grenadePriceCoins} coins / grenade
                </p>
                {shopMsg && <p className="text-[9px] text-muted-foreground mt-1 font-mono">{shopMsg}</p>}
              </div>
              <button
                onClick={handleBuyGrenades}
                disabled={buyingGrenade}
                className="h-8 px-3 rounded-lg text-[10px] font-bold tracking-wide bg-red-500/15 border border-red-400/40 text-red-300 hover:bg-red-500/25 disabled:opacity-60 flex items-center gap-1 shrink-0"
              >
                {buyingGrenade ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
                BUY
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Match Modal (shared) ── */}
      {showMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f1720] border border-white/10 rounded-2xl w-full max-w-sm landscape:max-w-lg landscape:max-h-[90vh] overflow-hidden flex flex-col slide-in-from-bottom-5 animate-in fade-in">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-white font-display font-bold tracking-widest text-lg">MATCH SETTINGS</h2>
              <button onClick={closeMatchModal} className="text-white/50 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* In landscape, show mode + size side by side */}
            <div className="p-5 flex flex-col landscape:flex-row gap-6">
              {/* Game Mode */}
              <div className="space-y-3 flex-1">
                <p className="text-white/60 font-mono text-xs">SELECT MODE</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMatchMode('classic')}
                    className={`flex flex-col items-center justify-center py-3 landscape:py-2 rounded-xl border ${matchMode === 'classic' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm mb-1 mt-1">CLASSIC SQUAD</span>
                    <span className="text-[10px] font-mono opacity-60">Round Based</span>
                  </button>
                  <button
                    onClick={() => setMatchMode('tdm')}
                    className={`flex flex-col items-center justify-center py-3 landscape:py-2 rounded-xl border ${matchMode === 'tdm' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm mb-1 mt-1">TEAM DEATHMATCH</span>
                    <span className="text-[10px] font-mono opacity-60">Time Based</span>
                  </button>
                </div>
              </div>

              {/* Team Size */}
              <div className="space-y-3 flex-1">
                <p className="text-white/60 font-mono text-xs">TEAM SIZE</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setTeamSize('duo')}
                    disabled={isDuoLocked}
                    className={`flex flex-col items-center justify-center py-3 landscape:py-2 rounded-xl border ${selectedTeamSize === 'duo' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm">DUO</span>
                    <span className="text-[10px] font-mono opacity-60">2 vs 2</span>
                  </button>
                  <button
                    onClick={() => setTeamSize('squad')}
                    className={`flex flex-col items-center justify-center py-3 landscape:py-2 rounded-xl border ${selectedTeamSize === 'squad' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} transition-all`}
                  >
                    <span className="font-display font-bold tracking-wider text-sm">SQUAD</span>
                    <span className="text-[10px] font-mono opacity-60">4 vs 4</span>
                  </button>
                </div>
                {isDuoLocked && (
                  <p className="text-[10px] text-amber-300 font-mono">Duo locked: team has more than 2 players.</p>
                )}
              </div>
            </div>

            <div className="px-5 pb-2 space-y-3">
              <p className="text-white/60 font-mono text-xs">TEAM CODE (REMOTE PARTY • WEBRTC)</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-display tracking-[0.25em] text-lg text-primary">
                  {partyCode}
                </div>
                <button
                  onClick={() => navigator.clipboard?.writeText(partyCode)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-mono text-white/80 hover:bg-white/10"
                >
                  COPY
                </button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                  placeholder="Enter join code"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white outline-none focus:border-primary/60"
                />
                <button onClick={handleJoinByCode} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[10px] font-mono text-primary">
                  JOIN
                </button>
              </div>
              {partyMsg && <p className="text-[10px] font-mono text-muted-foreground">{partyMsg}</p>}
              <p className="text-[10px] font-mono text-white/70">
                Role: {isPartyHost ? 'Host' : 'Joined'} • P2P: {connected ? 'Connected' : 'Waiting'} • Peers: {Math.max(playerCount - 1, 0)}
              </p>
              <p className="text-[10px] font-mono text-white/70">
                Team members: {partyMembers.length} • Remaining needed: {Math.max((selectedTeamSize === 'duo' ? 2 : 4) - partyMembers.length, 0)}
              </p>
            </div>

            <div className="p-4 pt-2">
              <button
                onClick={() => {
                  setShowMatchModal(false);
                  if (isHost) {
                    broadcast({ type: 'startSearch', mode: matchMode, size: selectedTeamSize, partySize: partyMembers.length, partyCode });
                  } else {
                    sendData({ type: 'partyMessage', text: 'Only host can start search. Waiting for host...' });
                    setPartyMsg('Only host can start search.');
                    return;
                  }
                  onMatchMake(matchMode, selectedTeamSize, partyMembers.length, partyCode);
                }}
                className="w-full py-3 rounded-xl font-display font-black tracking-[0.2em] text-black"
                style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}
              >
                START SEARCH
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Portrait content extracted for reuse ─── */
function PortraitContent({
  user, isEditingName, editedName, setEditedName, setIsEditingName, handleSaveName,
  signingOut, handleSignOut, level, xp, xpProgress, kd, stats, coins, grenadesOwned,
  buyingGrenade, handleBuyGrenades, shopMsg, onOpenStore, onOpenMatchModal, onOfflinePlay,
}: any) {
  return (
    <>
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

      {/* Level + XP */}
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

      {/* Stats grids */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Swords className="w-4 h-4" />}                             label="K/D"    value={kd}                     color="#00ff88" glow />
        <StatCard icon={<TrendingUp className="w-4 h-4" />}                         label="KILLS"  value={stats?.total_kills ?? 0} color="#ffdd00" />
        <StatCard icon={<TrendingUp className="w-4 h-4 text-green-400" />}          label="WINS"   value={stats?.wins ?? 0}         color="#00eeaa" />
        <StatCard icon={<TrendingUp className="w-4 h-4 rotate-180 text-red-500" />} label="LOSSES" value={stats?.losses ?? 0}       color="#ff4466" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Coins className="w-4 h-4" />} label="COINS"    value={coins}        color="#ffd166" glow />
        <StatCard icon={<Bomb className="w-4 h-4" />}  label="GRENADES" value={grenadesOwned} color="#ff4d4d" />
      </div>

      {/* Grenade shop */}
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

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onOpenStore}
          className="h-10 w-full rounded-xl font-display tracking-wider text-xs font-bold text-yellow-200 border border-yellow-400/30 hover:border-yellow-300/60 hover:text-yellow-100 transition-all flex items-center justify-center gap-2"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          OPEN STORE
        </button>
        <button
          onClick={onOpenMatchModal}
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

/* ─── StatCard ─── */
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
