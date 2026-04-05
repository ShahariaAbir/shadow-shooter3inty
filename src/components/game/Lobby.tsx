import { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Swords, Camera, Bot, Users, X, Settings, Map, Plus, Minus, Send, MessageSquare } from 'lucide-react';
import type { LobbyPlayer, GameMode } from '@/types/game';
import type { BotTier } from '@/lib/botAI';
import { GAME_MAPS } from '@/types/maps';

interface LobbyProps {
  roomCode: string;
  isHost: boolean;
  players: LobbyPlayer[];
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  onTeamSwap: (playerId: string) => void;
  onStart: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onSoloPlay: (botTier: BotTier, botCount: number, mode: GameMode, mapId: string, teamBotConfigs?: Array<{ team: 'green' | 'red'; tier: BotTier }>) => void;
  error: string;
  myId: string;
  isJoining: boolean;
  selectedMap: string;
  onMapChange: (mapId: string) => void;
  onOpenSettings: () => void;
  username: string;
  onAddBot?: (tier: BotTier) => void;
  onRemoveBot?: () => void;
  botCount?: number;
  chatMessages: { id: string; sender: string; text: string; color: string }[];
  onSendChat: (text: string) => void;
}

const Lobby = ({
  roomCode, isHost, players, mode, onModeChange, onTeamSwap, onStart,
  onCreateRoom, onJoinRoom, onSoloPlay, error, myId, isJoining,
  selectedMap, onMapChange, onOpenSettings, username,
  onAddBot, onRemoveBot, botCount = 0, chatMessages, onSendChat,
}: LobbyProps) => {
  const [joinCode, setJoinCode] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [soloBotTier, setSoloBotTier] = useState<BotTier>(1);
  const [soloBotCount, setSoloBotCount] = useState(1);
  const [soloMode, setSoloMode] = useState<GameMode>('ffa');
  const [soloMap, setSoloMap] = useState('classic');
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Per-team bot config for team modes
  const [greenT1, setGreenT1] = useState(1);
  const [greenT2, setGreenT2] = useState(0);
  const [greenT3, setGreenT3] = useState(0);
  const [redT1, setRedT1] = useState(1);
  const [redT2, setRedT2] = useState(1);
  const [redT3, setRedT3] = useState(0);
  const scannerRef = useRef<any>(null);
  const scannerReadyRef = useRef(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!showScanner) {
      scannerReadyRef.current = false;
      joinedRef.current = false;
      return;
    }
    let scanner: any;
    const timeout = setTimeout(async () => {
      try {
        const el = document.getElementById('qr-reader');
        if (!el) return;
        const { Html5Qrcode } = await import('html5-qrcode');
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;
        scannerReadyRef.current = true;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 250, height: 250 } },
          (text: string) => {
            if (joinedRef.current) return;
            const match = text.match(/[?&]room=([A-Za-z0-9]{4})/);
            if (match) {
              joinedRef.current = true;
              scanner.stop().catch(() => { });
              scannerReadyRef.current = false;
              setShowScanner(false);
              setTimeout(() => onJoinRoom(match[1].toUpperCase()), 100);
            }
          },
          () => { }
        );
      } catch (e) {
        console.warn('Scanner error:', e);
      }
    }, 400);
    return () => {
      clearTimeout(timeout);
      if (scannerReadyRef.current && scanner) {
        scanner.stop?.().catch(() => { });
      }
    };
  }, [showScanner, onJoinRoom]);

  const stopScanner = () => {
    setShowScanner(false);
    if (scannerReadyRef.current) {
      scannerRef.current?.stop?.().catch(() => { });
      scannerReadyRef.current = false;
    }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  // Entry screen
  if (!roomCode && !isJoining) {
    const soloMapObj = GAME_MAPS.find(m => m.id === soloMap) || GAME_MAPS[0];
    return (
      <div className="h-[100dvh] flex flex-col items-center bg-background px-4 gap-2 overflow-y-auto py-6">
        <div className="flex-1" />
        <img src="/icon-512.png" alt="Shadow Shooter" className="w-14 h-14 rounded-2xl shadow-lg shadow-primary/20" />
        <h1 className="font-display text-xl font-black text-primary tracking-[0.3em]">SHADOW</h1>
        <h1 className="font-display text-lg font-black text-foreground tracking-[0.3em] -mt-1 mb-1">SHOOTER</h1>

        {username && (
          <p className="font-mono text-xs text-primary/80">Welcome, {username}</p>
        )}

        {showScanner && (
          <div className="w-full max-w-[320px] mb-1 mx-auto">
            <div id="qr-reader" className="rounded-lg overflow-hidden bg-black/50" style={{ width: '100%', minHeight: 300 }} />
            <Button variant="ghost" size="sm" onClick={stopScanner} className="w-full mt-2 font-mono text-xs text-muted-foreground h-10">
              <X className="w-3 h-3 mr-1" /> CLOSE SCANNER
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2 w-full max-w-[280px]">
          <Button onClick={onCreateRoom} className="h-11 font-display tracking-[0.2em] text-sm active:scale-95 transition-transform" size="lg">
            <Swords className="w-4 h-4 mr-2" /> CREATE ROOM
          </Button>

          <div className="flex gap-2">
            <Input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={4}
              className="text-center font-mono text-lg tracking-[0.5em] uppercase h-10 flex-1"
            />
            <Button onClick={() => onJoinRoom(joinCode)} variant="secondary" className="h-10 px-4 font-display tracking-wider text-xs active:scale-95 transition-transform" disabled={joinCode.length < 4}>
              <Users className="w-3 h-3 mr-1" /> JOIN
            </Button>
          </div>

          {!showScanner && (
            <Button onClick={() => setShowScanner(true)} variant="outline" className="h-10 font-display tracking-wider text-xs active:scale-95 transition-transform">
              <Camera className="w-3 h-3 mr-1" /> SCAN QR
            </Button>
          )}

          <div className="flex items-center gap-3 my-0.5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground font-mono text-[9px] tracking-wider">OFFLINE</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Solo config */}
          <div className="border border-accent/30 bg-accent/5 rounded-lg p-3 space-y-2">
            {/* Game Mode */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">MODE</span>
              <div className="flex gap-1">
                {(['ffa', 'tdm', 'classic'] as GameMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setSoloMode(m)}
                    className={`px-2 py-1 rounded text-[9px] font-mono border transition-all active:scale-95 ${soloMode === m ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary/30 border-border/50 text-muted-foreground'
                      }`}
                  >
                    {m === 'ffa' ? 'FFA' : m === 'tdm' ? 'TEAM' : 'CLASSIC'}
                  </button>
                ))}
              </div>
            </div>

            {/* Map selection */}
            <div>
              <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                <Map className="w-3 h-3" /> MAP
              </span>
              <div className="flex gap-1 flex-wrap">
                {GAME_MAPS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSoloMap(m.id)}
                    className={`px-2 py-1 rounded text-[8px] font-mono border transition-all active:scale-95 ${soloMap === m.id
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-secondary/30 border-border/50 text-muted-foreground'
                      }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              <p className="font-mono text-[8px] text-muted-foreground mt-0.5">{soloMapObj.description}</p>
              <div className="mt-2 w-full h-24 bg-black/40 border border-primary/20 rounded-md overflow-hidden relative">
                <svg viewBox="0 0 1600 900" className="w-full h-full opacity-60">
                  {soloMapObj.obstacles.map((obs, i) => (
                    <rect key={i} x={obs.x} y={obs.y} width={obs.w} height={obs.h} fill="#121c2b" stroke="#00ff88" strokeWidth="2" strokeOpacity="0.5" />
                  ))}
                  {soloMapObj.spawnPoints.map((sp, i) => (
                    <circle key={i} cx={sp.x} cy={sp.y} r="16" fill="#00ff88" fillOpacity="0.2" stroke="#00ff88" strokeWidth="2" />
                  ))}
                </svg>
              </div>
            </div>

            {/* FFA bot config */}
            {(soloMode === 'ffa') && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">BOT DIFFICULTY</span>
                  <div className="flex gap-1">
                    <button onClick={() => setSoloBotTier(1)}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono border transition-all active:scale-95 ${soloBotTier === 1 ? 'bg-accent/20 border-accent text-accent' : 'bg-secondary/30 border-border/50 text-muted-foreground'
                        }`}>NORMAL</button>
                    <button onClick={() => setSoloBotTier(2)}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono border transition-all active:scale-95 ${soloBotTier === 2 ? 'bg-orange-500/20 border-orange-500 text-orange-500' : 'bg-secondary/30 border-border/50 text-muted-foreground'
                        }`}>HARD</button>
                    <button onClick={() => setSoloBotTier(3)}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono border transition-all active:scale-95 ${soloBotTier === 3 ? 'bg-destructive/20 border-destructive text-destructive' : 'bg-secondary/30 border-border/50 text-muted-foreground'
                        }`}>EPIC</button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">BOT COUNT</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSoloBotCount(c => Math.max(1, c - 1))} className="w-7 h-7 rounded border border-border/50 text-muted-foreground font-mono text-sm flex items-center justify-center active:scale-90">−</button>
                    <span className="font-mono text-sm text-foreground w-4 text-center">{soloBotCount}</span>
                    <button onClick={() => setSoloBotCount(c => Math.min(5, c + 1))} className="w-7 h-7 rounded border border-border/50 text-muted-foreground font-mono text-sm flex items-center justify-center active:scale-90">+</button>
                  </div>
                </div>
              </>
            )}

            {/* Team bot config */}
            {(soloMode === 'tdm' || soloMode === 'classic') && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-muted-foreground">TEAM BOT SETUP</p>
                {/* Green team */}
                <div className="border border-green-800/40 bg-green-900/10 rounded p-2 space-y-1">
                  <p className="font-mono text-[9px] text-green-400">GREEN TEAM (your team)</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-muted-foreground">Normal (T1)</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setGreenT1(c => Math.max(0, c - 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">−</button>
                      <span className="font-mono text-xs text-foreground w-3 text-center">{greenT1}</span>
                      <button onClick={() => setGreenT1(c => Math.min(4, c + 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-muted-foreground">Hard (T2)</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setGreenT2(c => Math.max(0, c - 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">−</button>
                      <span className="font-mono text-xs text-foreground w-3 text-center">{greenT2}</span>
                      <button onClick={() => setGreenT2(c => Math.min(4, c + 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-muted-foreground">Epic (T3)</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setGreenT3(c => Math.max(0, c - 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">−</button>
                      <span className="font-mono text-xs text-foreground w-3 text-center">{greenT3}</span>
                      <button onClick={() => setGreenT3(c => Math.min(4, c + 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">+</button>
                    </div>
                  </div>
                </div>
                {/* Red team */}
                <div className="border border-red-800/40 bg-red-900/10 rounded p-2 space-y-1">
                  <p className="font-mono text-[9px] text-red-400">RED TEAM (enemy)</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-muted-foreground">Normal (T1)</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setRedT1(c => Math.max(0, c - 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">−</button>
                      <span className="font-mono text-xs text-foreground w-3 text-center">{redT1}</span>
                      <button onClick={() => setRedT1(c => Math.min(4, c + 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-muted-foreground">Hard (T2)</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setRedT2(c => Math.max(0, c - 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">−</button>
                      <span className="font-mono text-xs text-foreground w-3 text-center">{redT2}</span>
                      <button onClick={() => setRedT2(c => Math.min(4, c + 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-muted-foreground">Epic (T3)</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setRedT3(c => Math.max(0, c - 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">−</button>
                      <span className="font-mono text-xs text-foreground w-3 text-center">{redT3}</span>
                      <button onClick={() => setRedT3(c => Math.min(4, c + 1))} className="w-6 h-6 rounded border border-border/50 text-muted-foreground font-mono text-xs flex items-center justify-center active:scale-90">+</button>
                    </div>
                  </div>
                </div>
                <p className="font-mono text-[8px] text-muted-foreground">Total: Green {1 + greenT1 + greenT2 + greenT3} (you + {greenT1 + greenT2 + greenT3} bots) vs Red {redT1 + redT2 + redT3} bots</p>
              </div>
            )}

            <Button onClick={() => {
              if (soloMode === 'tdm' || soloMode === 'classic') {
                const teamBots: Array<{ team: 'green' | 'red'; tier: BotTier }> = [];
                for (let i = 0; i < greenT1; i++) teamBots.push({ team: 'green', tier: 1 });
                for (let i = 0; i < greenT2; i++) teamBots.push({ team: 'green', tier: 2 });
                for (let i = 0; i < greenT3; i++) teamBots.push({ team: 'green', tier: 3 });
                for (let i = 0; i < redT1; i++) teamBots.push({ team: 'red', tier: 1 });
                for (let i = 0; i < redT2; i++) teamBots.push({ team: 'red', tier: 2 });
                for (let i = 0; i < redT3; i++) teamBots.push({ team: 'red', tier: 3 });
                if (teamBots.length === 0) return;
                onSoloPlay(1, teamBots.length, soloMode, soloMap, teamBots);
              } else {
                onSoloPlay(soloBotTier, soloBotCount, soloMode, soloMap);
              }
            }} variant="secondary" className="h-11 w-full font-display tracking-[0.2em] text-sm border border-accent/30 bg-accent/10 hover:bg-accent/20 text-accent active:scale-95 transition-transform"
              disabled={(soloMode === 'tdm' || soloMode === 'classic') && (greenT1 + greenT2 + greenT3 + redT1 + redT2 + redT3 === 0)}
            >
              <Bot className="w-4 h-4 mr-2" /> SOLO vs BOT
            </Button>
          </div>

          <Button onClick={onOpenSettings} variant="ghost" className="h-9 font-mono text-[10px] text-muted-foreground tracking-wider active:scale-95 transition-transform">
            <Settings className="w-3 h-3 mr-1" /> SETTINGS
          </Button>
        </div>

        {error && (
          <div className="mt-1 text-center">
            <p className="text-destructive font-mono text-xs">{error}</p>
            <p className="text-muted-foreground font-mono text-[9px] mt-0.5">No internet? Try Solo mode!</p>
          </div>
        )}

        <p className="text-muted-foreground/40 font-mono text-[9px] mt-1 text-center max-w-[280px]">
          Same WiFi for multiplayer • Solo works offline
        </p>
        <div className="flex-1" />
      </div>
    );
  }

  // Joining loading screen
  if (isJoining && !roomCode) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background gap-4">
        <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground font-mono text-xs animate-pulse">Connecting to room...</p>
        {error && <p className="text-destructive font-mono text-xs">{error}</p>}
      </div>
    );
  }

  // Lobby room screen
  const currentMap = GAME_MAPS.find(m => m.id === selectedMap) || GAME_MAPS[0];

  return (
    <div className="h-[100dvh] flex flex-col items-center bg-background px-4 py-4 gap-2 overflow-y-auto">
      <h2 className="font-display text-[10px] font-bold text-muted-foreground tracking-widest">ROOM CODE</h2>
      <div className="text-2xl font-display font-black text-primary tracking-[0.5em]">{roomCode}</div>

      {isHost && (
        <div className="bg-white p-3 rounded-xl shadow-lg shadow-primary/20 my-2">
          <QRCodeSVG value={`${window.location.origin}/game?room=${roomCode}`} size={160} bgColor="#fff" fgColor="#000" level="H" />
          <p className="text-center text-[10px] text-gray-500 mt-2 font-mono font-bold tracking-wider">SCAN TO JOIN</p>
        </div>
      )}

      {isHost && (
        <div className="flex gap-1.5 flex-wrap justify-center">
          <Button variant={mode === 'ffa' ? 'default' : 'secondary'} onClick={() => onModeChange('ffa')} className="font-mono text-[10px] h-8 px-3 active:scale-95 transition-transform" size="sm">FFA</Button>
          <Button variant={mode === 'tdm' ? 'default' : 'secondary'} onClick={() => onModeChange('tdm')} className="font-mono text-[10px] h-8 px-3 active:scale-95 transition-transform" size="sm">TEAM</Button>
          <Button variant={mode === 'classic' ? 'default' : 'secondary'} onClick={() => onModeChange('classic')} className="font-mono text-[10px] h-8 px-3 active:scale-95 transition-transform" size="sm">CLASSIC</Button>
        </div>
      )}
      {!isHost && (
        <p className="font-mono text-[10px] text-muted-foreground">
          Mode: {mode === 'ffa' ? 'Free For All' : mode === 'tdm' ? 'Team Deathmatch' : 'Classic Squad'}
        </p>
      )}

      {/* Map selection */}
      {isHost && (
        <div className="w-full max-w-xs">
          <p className="text-muted-foreground font-mono text-[9px] tracking-wider mb-1 flex items-center gap-1">
            <Map className="w-3 h-3" /> MAP
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {GAME_MAPS.map(m => (
              <button
                key={m.id}
                onClick={() => onMapChange(m.id)}
                className={`px-2.5 py-1.5 rounded text-[9px] font-mono border transition-all active:scale-95 ${selectedMap === m.id
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-secondary/30 border-border/50 text-muted-foreground hover:text-foreground'
                  }`}
              >
                {m.name}
              </button>
            ))}
          </div>
          <p className="font-mono text-[8px] text-muted-foreground mt-0.5">{currentMap.description}</p>
          <div className="mt-2 w-full h-32 bg-black/40 border border-primary/20 rounded-md overflow-hidden relative shadow-inner">
            <svg viewBox="0 0 1600 900" className="w-full h-full opacity-80">
              {currentMap.obstacles.map((obs, i) => (
                <rect key={i} x={obs.x} y={obs.y} width={obs.w} height={obs.h} fill="#121c2b" stroke="#00ff88" strokeWidth="3" strokeOpacity="0.6" />
              ))}
              {currentMap.spawnPoints.map((sp, i) => (
                <circle key={i} cx={sp.x} cy={sp.y} r="20" fill="#00ff88" fillOpacity="0.3" stroke="#00ff88" strokeWidth="3" />
              ))}
            </svg>
          </div>
        </div>
      )}
      {!isHost && (
        <div className="w-full max-w-xs">
          <p className="font-mono text-[9px] text-muted-foreground">Map: {currentMap.name}</p>
          <div className="mt-1 w-full h-24 bg-black/40 border border-primary/10 rounded-md overflow-hidden relative">
            <svg viewBox="0 0 1600 900" className="w-full h-full opacity-60">
              {currentMap.obstacles.map((obs, i) => (
                <rect key={i} x={obs.x} y={obs.y} width={obs.w} height={obs.h} fill="#121c2b" stroke="#00ff88" strokeWidth="2" strokeOpacity="0.3" />
              ))}
              {currentMap.spawnPoints.map((sp, i) => (
                <circle key={i} cx={sp.x} cy={sp.y} r="16" fill="#00ff88" fillOpacity="0.1" stroke="#00ff88" strokeWidth="2" />
              ))}
            </svg>
          </div>
        </div>
      )}

      <div className="w-full max-w-xs space-y-1">
        <p className="text-muted-foreground font-mono text-[9px] tracking-wider">PLAYERS ({players.length})</p>
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-border/50" style={{ backgroundColor: p.color + '0a' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px]"
              style={{ backgroundColor: p.color + '33', color: p.color, border: `2px solid ${p.color}` }}>
              {p.id.startsWith('bot-') ? <Bot className="w-3 h-3" /> : p.number}
            </div>
            <span className="font-mono text-[11px] flex-1" style={{ color: p.color }}>
              {p.name || (p.id.startsWith('bot-') ? `Bot ${p.number}` : `Player ${p.number}`)}
              {p.id === players[0]?.id && ' (HOST)'}
              {p.id === myId ? ' (YOU)' : ''}
            </span>
            {(mode === 'tdm' || mode === 'classic') && (
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded cursor-pointer active:scale-95 transition-transform ${p.team === 'green' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}
                onClick={() => isHost && onTeamSwap(p.id)}
              >
                {p.team?.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Add bots */}
      {isHost && onAddBot && onRemoveBot && (
        <div className="w-full max-w-xs">
          <p className="text-muted-foreground font-mono text-[9px] tracking-wider mb-1 flex items-center gap-1">
            <Bot className="w-3 h-3" /> BOTS ({botCount})
          </p>
          <div className="flex gap-1.5 items-center">
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[9px] active:scale-95" onClick={() => onAddBot(1)}>
              <Plus className="w-3 h-3 mr-0.5" /> T1
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[9px] active:scale-95" onClick={() => onAddBot(2)}>
              <Plus className="w-3 h-3 mr-0.5" /> T2
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[9px] active:scale-95" onClick={() => onAddBot(3)}>
              <Plus className="w-3 h-3 mr-0.5" /> T3
            </Button>
            {botCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 font-mono text-[9px] text-destructive active:scale-95" onClick={onRemoveBot}>
                <Minus className="w-3 h-3 mr-0.5" /> REMOVE
              </Button>
            )}
            <span className="font-mono text-[8px] text-muted-foreground ml-1">T1=Norm T2=Hard T3=Epic</span>
          </div>
        </div>
      )}

      {isHost ? (
        <Button onClick={onStart} className="font-display tracking-[0.2em] h-12 px-8 text-sm w-full max-w-xs active:scale-95 transition-transform shrink-0" size="lg" disabled={players.length < 2}>
          <Swords className="w-4 h-4 mr-2" /> START GAME
        </Button>
      ) : (
        <p className="text-muted-foreground font-mono text-xs animate-pulse">Waiting for host...</p>
      )}

      {error && <p className="text-destructive font-mono text-xs">{error}</p>}

      {/* Group Chat */}
      <div className="w-full max-w-xs mt-4 bg-card/40 border border-border/50 rounded-xl overflow-hidden flex flex-col shrink-0">
        <div className="bg-black/40 px-3 py-1.5 flex items-center gap-2 border-b border-border/50">
          <MessageSquare className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-[10px] text-muted-foreground tracking-wider">LOBBY CHAT</span>
        </div>
        <div className="h-32 p-2 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-primary/20 flex flex-col">
          {chatMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/40 font-mono text-[9px]">
              No messages yet. Say hi!
            </div>
          ) : (
            chatMessages.map(msg => {
              const senderIsHost = msg.sender === players[0]?.name || (players[0]?.name === undefined && msg.sender === `Player ${players[0]?.number}`);
              return (
                <div key={msg.id} className="text-[11px] font-mono leading-tight break-words">
                  <span className="font-bold opacity-90 mr-1.5" style={{ color: msg.color }}>{senderIsHost ? '[HOST] ' : ''}{msg.sender}:</span>
                  <span className="text-foreground/90">{msg.text}</span>
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>
        <form onSubmit={handleChatSubmit} className="flex border-t border-border/50 relative">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="Type a message..."
            maxLength={100}
            className="flex-1 bg-black/20 text-xs px-3 py-2 font-mono focus:outline-none placeholder:text-muted-foreground/40"
          />
          <button type="submit" disabled={!chatInput.trim()} className="px-3 text-primary disabled:opacity-30 hover:bg-primary/10 transition-colors">
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      <div className="shrink-0 h-4" />
    </div>
  );
};

export default Lobby;
