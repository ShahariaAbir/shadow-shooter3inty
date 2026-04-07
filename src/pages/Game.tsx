import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Crosshair, Heart, Shield, Bomb } from 'lucide-react';
import Joystick from '@/components/game/Joystick';
import AbilityButton from '@/components/game/AbilityButton';
import Lobby from '@/components/game/Lobby';
import Scoreboard from '@/components/game/Scoreboard';
import SettingsModal from '@/components/game/SettingsModal';
import KillFeedComponent from '@/components/game/KillFeed';
import type { KillFeedEntry } from '@/components/game/KillFeed';
import PauseMenu from '@/components/game/PauseMenu';
import { usePeer } from '@/hooks/usePeer';
import { loadSettings, saveSettings, type GameSettings } from '@/lib/settings';
import { GAME_MAPS, getMapById, type GameMap } from '@/types/maps';
import { SFX } from '@/lib/sounds';
import { createBotState, updateBot, type BotState, type BotTier } from '@/lib/botAI';
import { useAuth } from '@/hooks/useAuth';
import { MATCHMAKING_BOT_NAMES } from '@/components/MatchmakingScreen';
import {
  ARENA_W, ARENA_H, PLAYER_R, BULLET_R, BULLET_SPEED, FAST_BULLET_SPEED,
  PLAYER_SPEED, FAST_PLAYER_SPEED, BULLET_DAMAGE, MAX_HEALTH, FIRE_COOLDOWN,
  PLAYER_COLORS, RESPAWN_TIME, GAME_DURATION,
  TDM_WIN_SCORE, ABILITY_DURATION, GLUE_WALL_HEALTH, GLUE_WALL_WIDTH,
  GLUE_WALL_DURATION, POWERUP_SPAWN_INTERVAL, POWERUP_R, CLASSIC_WIN_ROUNDS,
  SMG_COOLDOWN, SMG_DAMAGE, SMG_RANGE, SMG_SPEED,
  SNIPER_COOLDOWN, SNIPER_DAMAGE, SNIPER_RANGE, SNIPER_SPEED, SNIPER_BULLET_R,
  GRENADE_TRIGGER_RADIUS, GRENADE_BLAST_RADIUS, GRENADE_AUTO_BLAST_MS,
  GRENADE_THROW_SPEED, GRENADE_MIN_ARM_MS,
} from '@/types/game';
import type { PlayerState, Bullet, Powerup, GlueWall, PlayerData, LobbyPlayer, GameMode, GameResult, Obstacle, WeaponType, Grenade } from '@/types/game';
import { collidesObs, ptInObs, distToSegment, getRandomSpawn, lineIntersectsCircle } from '@/lib/gameHelpers';
import { BOT_GRENADE_CONFIG } from '@/lib/economy';

type Screen = 'lobby' | 'playing' | 'gameover';

const POWERUP_COLORS: Record<string, string> = { speed: '#ffdd00', fastBullets: '#ff8800', heal: '#00ff44', glueWall: '#9944ff', weapon_smg: '#44ffff', weapon_sniper: '#ff44ff' };
const POWERUP_ICONS: Record<string, string> = { speed: '⚡', fastBullets: '»', heal: '+', glueWall: ')', weapon_smg: 'S', weapon_sniper: 'N' };
const SPAWN_PROTECTION_MS = 3000;
const GRENADE_BUTTON_COOLDOWN_MS = 100;

const resolveProtectionUntil = (data: { protectedFor?: number; protectedUntil?: number }) => {
  const now = Date.now();
  const protectedFor = Number(data.protectedFor);
  if (Number.isFinite(protectedFor) && protectedFor > 0) {
    return now + Math.min(SPAWN_PROTECTION_MS, protectedFor);
  }
  const receivedUntil = Number(data.protectedUntil);
  if (!Number.isFinite(receivedUntil)) return now + SPAWN_PROTECTION_MS;
  const remaining = Math.max(0, Math.min(SPAWN_PROTECTION_MS, receivedUntil - now));
  return now + remaining;
};

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}
interface BlastRing {
  id: string;
  x: number;
  y: number;
  radius: number;
  createdAt: number;
}

type ControlKey = 'move' | 'aim' | 'leftButtons' | 'rightButtons';
type ControlPositions = Record<ControlKey, { x: number; y: number }>;

// KillFeedEntry type is imported from KillFeed component

function collidesObsDynamic(x: number, y: number, r: number, obstacles: Obstacle[]) {
  return obstacles.some(o => {
    const clx = Math.max(o.x, Math.min(x, o.x + o.w));
    const cly = Math.max(o.y, Math.min(y, o.y + o.h));
    return (x - clx) ** 2 + (y - cly) ** 2 < r * r;
  });
}

function ptInObsDynamic(x: number, y: number, obstacles: Obstacle[]) {
  return obstacles.some(o => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
}

const Game = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, stats, hasPendingMatchmakingPenalty, submitMatchResult } = useAuth();
  const isMatchmakingMode = searchParams.get('mode') === 'matchmaking';
  const [screen, setScreen] = useState<Screen>('lobby');
  const [gameMode, setGameMode] = useState<GameMode>('ffa');
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [uiTeamScores, setUiTeamScores] = useState({ green: 0, red: 0 });
  const [uiTimeLeft, setUiTimeLeft] = useState(GAME_DURATION);
  const [uiScores, setUiScores] = useState<Record<string, number>>({});
  const [uiHealth, setUiHealth] = useState(MAX_HEALTH);
  const [uiAbilities, setUiAbilities] = useState({ speed: 0, fastBullets: 0, heal: 0, glueWall: 0 });
  const [uiEffectTimes, setUiEffectTimes] = useState({ speed: 0, fastBullets: 0 });
  const [uiAlive, setUiAlive] = useState(true);
  const [uiGrenades, setUiGrenades] = useState(0);
  const [isSolo, setIsSolo] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [myColor, setMyColor] = useState('#00ff88');
  const [uiRoundScores, setUiRoundScores] = useState({ green: 0, red: 0 });
  const [uiRoundBanner, setUiRoundBanner] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState('classic');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [lobbyBots, setLobbyBots] = useState<Array<{ id: string; tier: BotTier }>>([]);
  const [uiKillFeed, setUiKillFeed] = useState<KillFeedEntry[]>([]);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [isEditingControls, setIsEditingControls] = useState(false);
  const [lobbyChatMessages, setLobbyChatMessages] = useState<Array<{ id: string; sender: string; text: string; color: string }>>([]);
  const [controlPositions, setControlPositions] = useState<ControlPositions>({
    move: { x: 96, y: 0 },
    aim: { x: 0, y: 0 },
    leftButtons: { x: 96, y: 0 },
    rightButtons: { x: 0, y: 0 },
  });
  const [deathCounts, setDeathCounts] = useState<Record<string, number>>({});
  const playerNamesRef = useRef<Record<string, string>>({});
  const deathCountsRef = useRef<Record<string, number>>({});

  const isSoloRef = useRef(false);
  const botsRef = useRef<BotState[]>([]);
  const soloIdRef = useRef('solo-' + Math.random().toString(36).substr(2, 6));
  const roundScoresRef = useRef({ green: 0, red: 0 });
  const activeMapRef = useRef<GameMap>(GAME_MAPS[0]);

  const {
    createRoom, joinRoom, sendData, broadcast, onData,
    connected, isHost, roomCode, error, disconnect,
    myId, playerCount, getConnectedIds,
  } = usePeer();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const myPlayerRef = useRef<PlayerState>({ x: 400, y: 450, angle: 0, health: MAX_HEALTH, weapon: 'default' });
  const wasAimingRef = useRef(false);
  const remotePlayersRef = useRef<Map<string, PlayerState>>(new Map());
  const bulletsRef = useRef<Bullet[]>([]);
  const powerupsRef = useRef<Powerup[]>([]);
  const glueWallsRef = useRef<GlueWall[]>([]);
  const grenadesRef = useRef<Grenade[]>([]);
  const moveInRef = useRef({ x: 0, y: 0 });
  const aimInRef = useRef({ x: 0, y: 0 });
  const lastFireRef = useRef(0);
  const afRef = useRef(0);
  const scrRef = useRef(screen);
  const abilitiesRef = useRef({ speed: 0, fastBullets: 0, heal: 0, glueWall: 0 });
  const effectsRef = useRef({ speed: 0, fastBullets: 0 });
  const aliveRef = useRef(true);
  const scoresRef = useRef<Record<string, number>>({});
  const timeLeftRef = useRef(GAME_DURATION);
  const teamScoresRef = useRef({ green: 0, red: 0 });
  const playerDataRef = useRef<PlayerData[]>([]);
  const gameModeRef = useRef<GameMode>('ffa');
  const myIdRef = useRef('');
  const isHostRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const blastRingsRef = useRef<BlastRing[]>([]);
  const grenadeInventoryRef = useRef(0);
  const grenadesThrownByMeRef = useRef(0);
  const botGrenadeTickRef = useRef(0);
  const botGrenadeLastThrowRef = useRef<Record<string, number>>({});
  const grenadeSyncTickRef = useRef(0);
  const grenadeLastThrowAtRef = useRef(0);
  const killFeedRef = useRef<KillFeedEntry[]>([]);
  const killFeedIdRef = useRef(0);
  const hitFlashRef = useRef(0);
  const spawnProtectionUntilRef = useRef(0);
  const matchmakingAutoStartedRef = useRef(false);

  scrRef.current = screen;
  if (!isSoloRef.current) myIdRef.current = myId;
  isHostRef.current = isHost || isSoloRef.current;
  gameModeRef.current = gameMode;

  const handleSaveSettings = useCallback((s: GameSettings) => {
    setSettings(s);
    saveSettings(s);
  }, [isMatchmakingMode, stats?.grenades_owned]);

  const getDefaultControlPositions = useCallback((source: GameSettings): ControlPositions => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sideWidth = Math.max(vw * 0.18, 80);
    const leftBaseX = sideWidth / 2;
    const rightBaseX = vw - sideWidth / 2;
    const joystickY = vh - (source.joystickSize / 2 + 24);
    const buttonsY = joystickY - source.joystickSize / 2 - source.abilityButtonSize - 20;

    return {
      move: {
        x: leftBaseX + source.moveJoystickOffsetX,
        y: joystickY + source.moveJoystickOffsetY,
      },
      aim: {
        x: rightBaseX + source.aimJoystickOffsetX,
        y: joystickY + source.aimJoystickOffsetY,
      },
      leftButtons: {
        x: leftBaseX + source.leftButtonsOffsetX,
        y: buttonsY + source.leftButtonsOffsetY,
      },
      rightButtons: {
        x: rightBaseX + source.rightButtonsOffsetX,
        y: buttonsY + source.rightButtonsOffsetY,
      },
    };
  }, [isMatchmakingMode, stats?.grenades_owned]);

  useEffect(() => {
    const defaults = getDefaultControlPositions(settings);
    setControlPositions({
      move: {
        x: settings.moveControlX ?? defaults.move.x,
        y: settings.moveControlY ?? defaults.move.y,
      },
      aim: {
        x: settings.aimControlX ?? defaults.aim.x,
        y: settings.aimControlY ?? defaults.aim.y,
      },
      leftButtons: {
        x: settings.leftButtonsX ?? defaults.leftButtons.x,
        y: settings.leftButtonsY ?? defaults.leftButtons.y,
      },
      rightButtons: {
        x: settings.rightButtonsX ?? defaults.rightButtons.x,
        y: settings.rightButtonsY ?? defaults.rightButtons.y,
      },
    });
  }, [getDefaultControlPositions, settings]);

  const saveControlPositions = useCallback((positions: ControlPositions) => {
    const updatedSettings: GameSettings = {
      ...settings,
      moveControlX: positions.move.x,
      moveControlY: positions.move.y,
      aimControlX: positions.aim.x,
      aimControlY: positions.aim.y,
      leftButtonsX: positions.leftButtons.x,
      leftButtonsY: positions.leftButtons.y,
      rightButtonsX: positions.rightButtons.x,
      rightButtonsY: positions.rightButtons.y,
    };
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  }, [settings]);

  const updateControlPosition = useCallback((key: ControlKey, x: number, y: number) => {
    const maxX = window.innerWidth - 24;
    const maxY = window.innerHeight - 24;
    const clampedX = Math.max(24, Math.min(x, maxX));
    const clampedY = Math.max(24, Math.min(y, maxY));
    setControlPositions(prev => {
      const next = { ...prev, [key]: { x: clampedX, y: clampedY } };
      saveControlPositions(next);
      return next;
    });
  }, [saveControlPositions]);

  const spawnParticles = (x: number, y: number, color: string, count: number, speed: number = 3) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.5 + Math.random());
      particlesRef.current.push({
        x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: 1, maxLife: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 3,
      });
    }
  };


  const hasSpawnProtection = (playerId: string) => {
    const now = Date.now();
    if (playerId === myIdRef.current) {
      if (spawnProtectionUntilRef.current <= now) spawnProtectionUntilRef.current = 0;
      return spawnProtectionUntilRef.current > now;
    }
    const rp = remotePlayersRef.current.get(playerId) as (PlayerState & { protectedUntil?: number }) | undefined;
    // Dead players are never considered protected (protectedUntil is only valid while alive)
    if (!rp || rp.alive === false) return false;
    if (!rp.protectedUntil || rp.protectedUntil <= now) {
      if (rp.protectedUntil) {
        rp.protectedUntil = 0;
        remotePlayersRef.current.set(playerId, rp);
      }
      return false;
    }
    return true;
  };

  const getPlayerName = (id: string, fallbackNum: number) => {
    if (playerNamesRef.current[id]) return playerNamesRef.current[id];
    if (id.startsWith('bot-')) return `Bot ${fallbackNum}`;
    return `Player ${fallbackNum}`;
  };

  const addKillFeed = (killerId: string, victimId: string) => {
    const killer = playerDataRef.current.find(p => p.id === killerId);
    const victim = playerDataRef.current.find(p => p.id === victimId);
    if (!killer || !victim) return;
    const entry: KillFeedEntry = {
      id: killFeedIdRef.current++,
      killerName: getPlayerName(killerId, killer.number),
      victimName: getPlayerName(victimId, victim.number),
      killerColor: killer.color,
      victimColor: victim.color,
      time: Date.now(),
    };
    killFeedRef.current.push(entry);
    if (killFeedRef.current.length > 6) killFeedRef.current.shift();
    setUiKillFeed([...killFeedRef.current]);
  };

  // ─── LOBBY BOT MANAGEMENT ───

  const handleAddBot = useCallback((tier: BotTier) => {
    setLobbyBots(prev => {
      const idx = prev.length + 1;
      return [...prev, { id: `bot-${idx}-${Date.now()}`, tier }];
    });
  }, [isMatchmakingMode, stats?.grenades_owned]);

  const handleRemoveBot = useCallback(() => {
    setLobbyBots(prev => prev.slice(0, -1));
  }, []);

  // ─── LOBBY ───

  useEffect(() => {
    if (!isHost || !roomCode || !myId) return;
    const ids = getConnectedIds();
    const allIds = [myId, ...ids];
    const useTeams = gameMode === 'tdm' || gameMode === 'classic';
    const humanPlayers: LobbyPlayer[] = allIds.map((id, i) => ({
      id,
      number: i + 1,
      color: useTeams ? (i % 2 === 0 ? '#00ff88' : '#ff4466') : PLAYER_COLORS[i % PLAYER_COLORS.length],
      team: useTeams ? (i % 2 === 0 ? 'green' as const : 'red' as const) : undefined,
      name: id === myId ? settings.username : (playerNamesRef.current[id] || undefined),
    }));
    // Add lobby bots
    const botPlayers: LobbyPlayer[] = lobbyBots.map((b, i) => {
      const num = humanPlayers.length + i + 1;
      const tierLabel = b.tier === 2 ? '★' : '';
      return {
        id: b.id,
        number: num,
        color: useTeams ? (num % 2 === 0 ? '#ff4466' : '#00ff88') : PLAYER_COLORS[num % PLAYER_COLORS.length],
        team: useTeams ? (num % 2 === 0 ? 'red' as const : 'green' as const) : undefined,
        name: `Bot T${b.tier}${tierLabel}`,
      };
    });
    const allPlayers = [...humanPlayers, ...botPlayers];
    setLobbyPlayers(allPlayers);
    broadcast({ type: 'lobbyState', players: allPlayers, mode: gameMode, mapId: selectedMap });
  }, [playerCount, isHost, roomCode, myId, gameMode, selectedMap, broadcast, getConnectedIds, settings.username, lobbyBots]);

  const handleModeChange = useCallback((mode: GameMode) => setGameMode(mode), []);

  const handleTeamSwap = useCallback((playerId: string) => {
    setLobbyPlayers(prev => {
      const updated = prev.map(p =>
        p.id === playerId
          ? { ...p, team: p.team === 'green' ? 'red' as const : 'green' as const, color: p.team === 'green' ? '#ff4466' : '#00ff88' }
          : p
      );
      broadcast({ type: 'lobbyState', players: updated, mode: gameModeRef.current });
      return updated;
    });
  }, [broadcast]);

  const initGame = useCallback((players: PlayerData[], mode: GameMode, mapId?: string, botConfigs?: Array<{ id: string; tier: BotTier }>) => {
    if (mapId) activeMapRef.current = getMapById(mapId);
    playerDataRef.current = players;
    gameModeRef.current = mode;
    setGameMode(mode);
    // Store player names
    players.forEach(p => {
      if (p.name) playerNamesRef.current[p.id] = p.name;
    });
    const me = players.find(p => p.id === myIdRef.current);
    if (me) {
      myPlayerRef.current = { ...me.state };
      if (!myPlayerRef.current.weapon) myPlayerRef.current.weapon = 'default';
      setMyColor(me.color);
    }
    // Grant initial spawn protection (3 s) for all players at game start
    const gameStartProtectedUntil = Date.now() + 3000;
    spawnProtectionUntilRef.current = gameStartProtectedUntil;
    remotePlayersRef.current.clear();
    players.forEach(p => {
      if (p.id !== myIdRef.current)
        remotePlayersRef.current.set(p.id, { ...p.state, alive: true, protectedUntil: gameStartProtectedUntil } as PlayerState & { protectedUntil?: number });
      scoresRef.current[p.id] = 0;
    });
    if (botConfigs && botConfigs.length > 0) {
      botsRef.current = botConfigs.map(bc => createBotState(bc.id, bc.tier));
    }
    bulletsRef.current = [];
    powerupsRef.current = [];
    glueWallsRef.current = [];
    grenadesRef.current = [];
    botGrenadeLastThrowRef.current = {};
    blastRingsRef.current = [];
    abilitiesRef.current = { speed: 0, fastBullets: 0, heal: 0, glueWall: 0 };
    effectsRef.current = { speed: 0, fastBullets: 0 };
    aliveRef.current = true;
    timeLeftRef.current = GAME_DURATION;
    teamScoresRef.current = { green: 0, red: 0 };
    killFeedRef.current = [];
    setUiKillFeed([]);
    setUiHealth(MAX_HEALTH);
    setUiAlive(true);
    setUiTimeLeft(GAME_DURATION);
    setUiScores({});
    setUiTeamScores({ green: 0, red: 0 });
    setUiAbilities({ speed: 0, fastBullets: 0, heal: 0, glueWall: 0 });
    grenadeInventoryRef.current = isMatchmakingMode ? (stats?.grenades_owned || 0) : 0;
    grenadesThrownByMeRef.current = 0;
    grenadeLastThrowAtRef.current = 0;
    setUiGrenades(grenadeInventoryRef.current);
    setUiRoundBanner(null);
    setScreen('playing');
  }, [isMatchmakingMode, stats?.grenades_owned]);

  const startSoloGame = useCallback((botTier: BotTier = 1, botCount: number = 1, mode: GameMode = 'ffa', mapId: string = 'classic', teamBotConfigs?: Array<{ team: 'green' | 'red'; tier: BotTier }>) => {
    isSoloRef.current = true;
    setIsSolo(true);
    myIdRef.current = soloIdRef.current;
    roundScoresRef.current = { green: 0, red: 0 };
    setUiRoundScores({ green: 0, red: 0 });
    deathCountsRef.current = {};
    setDeathCounts({});
    const map = getMapById(mapId);
    activeMapRef.current = map;
    setSelectedMap(mapId);
    const sp = map.spawnPoints;
    const useTeams = mode === 'tdm' || mode === 'classic';
    const playerName = settings.username || 'Player';
    playerNamesRef.current[soloIdRef.current] = playerName;
    const players: PlayerData[] = [
      {
        id: soloIdRef.current, number: 1,
        color: useTeams ? '#00ff88' : PLAYER_COLORS[0],
        team: useTeams ? 'green' as const : undefined,
        state: { ...sp[0], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
        alive: true, score: 0, name: playerName,
      },
    ];
    const botConfigs: Array<{ id: string; tier: BotTier }> = [];
    if (useTeams && teamBotConfigs && teamBotConfigs.length > 0) {
      // Use per-team bot configs
      teamBotConfigs.forEach((tbc, i) => {
        const botId = `bot-${i + 1}`;
        const botNum = i + 2;
        const botName = `Bot T${tbc.tier}`;
        playerNamesRef.current[botId] = botName;
        players.push({
          id: botId, number: botNum,
          color: tbc.team === 'green' ? '#00ff88' : '#ff4466',
          team: tbc.team,
          state: { ...sp[(i + 1) % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
          alive: true, score: 0, name: botName,
        });
        botConfigs.push({ id: botId, tier: tbc.tier });
      });
    } else {
      for (let i = 0; i < botCount; i++) {
        const botId = `bot-${i + 1}`;
        const botNum = i + 2;
        const botName = `Bot T${botTier}`;
        playerNamesRef.current[botId] = botName;
        players.push({
          id: botId, number: botNum,
          color: useTeams ? (botNum % 2 === 0 ? '#ff4466' : '#00ff88') : PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
          team: useTeams ? (botNum % 2 === 0 ? 'red' as const : 'green' as const) : undefined,
          state: { ...sp[(i + 1) % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
          alive: true, score: 0, name: botName,
        });
        botConfigs.push({ id: botId, tier: botTier });
      }
    }
    botsRef.current = botConfigs.map(bc => createBotState(bc.id, bc.tier));
    initGame(players, mode, mapId, botConfigs);
  }, [initGame, settings.username]);

  const handleJoinWithLoading = useCallback((code: string) => {
    setIsJoining(true);
    joinRoom(code);
  }, [joinRoom]);

  const handleStartGame = useCallback(() => {
    roundScoresRef.current = { green: 0, red: 0 };
    setUiRoundScores({ green: 0, red: 0 });
    const map = getMapById(selectedMap);
    activeMapRef.current = map;
    const sp = map.spawnPoints;
    const players: PlayerData[] = lobbyPlayers.map((lp, i) => ({
      id: lp.id, number: lp.number, color: lp.color, team: lp.team,
      state: { ...sp[i % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
      alive: true, score: 0, name: lp.name,
    }));
    const botConfigs: Array<{ id: string; tier: BotTier }> = lobbyBots.map(b => ({ id: b.id, tier: b.tier }));
    botsRef.current = botConfigs.map(bc => createBotState(bc.id, bc.tier));
    broadcast({ type: 'start', mode: gameMode, players, mapId: selectedMap } as any);
    initGame(players, gameMode, selectedMap, botConfigs);
  }, [lobbyPlayers, gameMode, broadcast, initGame, selectedMap, lobbyBots]);

  // ─── KILL / END / REPLAY ───

  const endGame = useCallback(() => {
    SFX.gameOver();
    const results: GameResult[] = playerDataRef.current.map(p => ({
      id: p.id, number: p.number, color: p.color, team: p.team,
      score: scoresRef.current[p.id] || 0,
      name: p.name || playerNamesRef.current[p.id],
    }));
    broadcast({ type: 'gameOver', results, teamScores: { ...teamScoresRef.current }, roundScores: { ...roundScoresRef.current } });
    setGameResults(results);
    setUiTeamScores({ ...teamScoresRef.current });
    setScreen('gameover');
    // Submit stats for matchmaking games when user is logged in
    if (isMatchmakingMode && user) {
      const myKills = scoresRef.current[myIdRef.current] || 0;
      const myDeaths = deathCountsRef.current[myIdRef.current] || 0;
      let isWin = false;
      if (gameModeRef.current === 'classic') {
        isWin = roundScoresRef.current.green >= CLASSIC_WIN_ROUNDS;
      } else {
        isWin = teamScoresRef.current.green > teamScoresRef.current.red;
      }
      submitMatchResult(myKills, myDeaths, isWin, grenadesThrownByMeRef.current);
    }
  }, [broadcast, isMatchmakingMode, user, submitMatchResult]);

  const startNewRound = useCallback(() => {
    const sp = activeMapRef.current.spawnPoints;
    const roundProtectedUntil = Date.now() + 3000;
    const players: PlayerData[] = playerDataRef.current.map((p, i) => ({
      ...p,
      state: { ...sp[i % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
      alive: true,
    }));
    playerDataRef.current = players;
    const me = players.find(p => p.id === myIdRef.current);
    if (me) {
      myPlayerRef.current = { ...me.state };
      setMyColor(me.color);
    }
    // Grant spawn protection for the new round
    spawnProtectionUntilRef.current = roundProtectedUntil;
    remotePlayersRef.current.clear();
    players.forEach(p => {
      if (p.id !== myIdRef.current)
        remotePlayersRef.current.set(p.id, { ...p.state, alive: true, protectedUntil: roundProtectedUntil } as PlayerState & { protectedUntil?: number });
    });
    bulletsRef.current = [];
    powerupsRef.current = [];
    glueWallsRef.current = [];
    grenadesRef.current = [];
    botGrenadeLastThrowRef.current = {};
    blastRingsRef.current = [];
    abilitiesRef.current = { speed: 0, fastBullets: 0, heal: 0, glueWall: 0 };
    effectsRef.current = { speed: 0, fastBullets: 0 };
    aliveRef.current = true;
    // Reset bot abilities for new round
    for (const bot of botsRef.current) {
      bot.abilities = { speed: 0, fastBullets: 0, heal: 0, glueWall: 0 };
      bot.effects = { speed: 0, fastBullets: 0 };
    }
    setUiHealth(MAX_HEALTH);
    setUiAlive(true);
    setUiAbilities({ speed: 0, fastBullets: 0, heal: 0, glueWall: 0 });
    grenadeLastThrowAtRef.current = 0;
    setUiGrenades(grenadeInventoryRef.current);
    setUiRoundBanner(null);
    broadcast({ type: 'newRound', players, protectedUntil: roundProtectedUntil });
  }, [broadcast]);

  const checkClassicRoundOver = useCallback(() => {
    if (gameModeRef.current !== 'classic') return;
    const greenAlive = playerDataRef.current.some(p => {
      if (p.team !== 'green') return false;
      if (p.id === myIdRef.current) return aliveRef.current;
      const rp = remotePlayersRef.current.get(p.id);
      return rp?.alive !== false;
    });
    const redAlive = playerDataRef.current.some(p => {
      if (p.team !== 'red') return false;
      if (p.id === myIdRef.current) return aliveRef.current;
      const rp = remotePlayersRef.current.get(p.id);
      return rp?.alive !== false;
    });
    if (!greenAlive || !redAlive) {
      const roundWinner = greenAlive ? 'green' : 'red';
      roundScoresRef.current[roundWinner] += 1;
      setUiRoundScores({ ...roundScoresRef.current });
      SFX.roundWin();
      broadcast({ type: 'roundOver', winner: roundWinner, roundScores: { ...roundScoresRef.current } });
      if (roundScoresRef.current[roundWinner] >= CLASSIC_WIN_ROUNDS) {
        setTimeout(() => endGame(), 2000);
      } else {
        setUiRoundBanner(`${roundWinner.toUpperCase()} wins round!`);
        setTimeout(() => startNewRound(), 3000);
      }
    }
  }, [broadcast, endGame, startNewRound]);

  const handleKillEvent = useCallback((killerId: string, victimId: string) => {
    scoresRef.current[killerId] = (scoresRef.current[killerId] || 0) + 1;
    deathCountsRef.current[victimId] = (deathCountsRef.current[victimId] || 0) + 1;
    setDeathCounts({ ...deathCountsRef.current });
    if (killerId === myIdRef.current) SFX.kill();
    if (victimId === myIdRef.current) SFX.death();
    if (gameModeRef.current === 'tdm') {
      const kd = playerDataRef.current.find(p => p.id === killerId);
      if (kd?.team) {
        teamScoresRef.current[kd.team] += 1;
        if (teamScoresRef.current[kd.team] >= TDM_WIN_SCORE) { endGame(); return; }
      }
    }
    const victimState = remotePlayersRef.current.get(victimId);
    if (victimState) {
      spawnParticles(victimState.x, victimState.y, playerDataRef.current.find(p => p.id === victimId)?.color || '#fff', 20, 4);
      victimState.alive = false;
      // Clear any lingering spawn protection so it doesn't carry over to the next life
      (victimState as PlayerState & { protectedUntil?: number }).protectedUntil = undefined;
      remotePlayersRef.current.set(victimId, victimState);
    }
    if (victimId === myIdRef.current) {
      spawnParticles(myPlayerRef.current.x, myPlayerRef.current.y, myColor, 20, 4);
    }
    addKillFeed(killerId, victimId);
    broadcast({ type: 'kill', killerId, victimId });
    broadcast({ type: 'scoreUpdate', scores: { ...scoresRef.current }, teamScores: { ...teamScoresRef.current } });
    setUiScores({ ...scoresRef.current });
    setUiTeamScores({ ...teamScoresRef.current });
    if (victimId === myIdRef.current) {
      aliveRef.current = false;
      setUiAlive(false);
      hitFlashRef.current = Date.now();
    }
    if (gameModeRef.current === 'classic') {
      setTimeout(() => checkClassicRoundOver(), 500);
      return;
    }
    // Respawn
    setTimeout(() => {
      const sp = activeMapRef.current.spawnPoints;
      const spawn = sp[Math.floor(Math.random() * sp.length)];
      const protectedUntil = Date.now() + SPAWN_PROTECTION_MS;
      broadcast({ type: 'respawn', playerId: victimId, x: spawn.x, y: spawn.y, protectedUntil, protectedFor: SPAWN_PROTECTION_MS });
      if (victimId === myIdRef.current) {
        myPlayerRef.current = { x: spawn.x, y: spawn.y, angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' };
        aliveRef.current = true;
        spawnProtectionUntilRef.current = protectedUntil;
        setUiAlive(true);
        setUiHealth(MAX_HEALTH);
      } else {
        const rp = remotePlayersRef.current.get(victimId);
        if (rp) {
          rp.x = spawn.x; rp.y = spawn.y; rp.angle = 0; rp.health = MAX_HEALTH; rp.alive = true; rp.weapon = 'default';
          (rp as PlayerState & { protectedUntil?: number }).protectedUntil = protectedUntil;
          remotePlayersRef.current.set(victimId, rp);
        }
      }
    }, RESPAWN_TIME);
  }, [broadcast, endGame, checkClassicRoundOver, myColor]);

  const handleReplay = useCallback(() => {
    roundScoresRef.current = { green: 0, red: 0 };
    setUiRoundScores({ green: 0, red: 0 });
    const sp = activeMapRef.current.spawnPoints;
    const players: PlayerData[] = playerDataRef.current.map((p, i) => ({
      ...p,
      state: { ...sp[i % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
      alive: true, score: 0,
    }));
    // Reset bots
    for (const bot of botsRef.current) {
      bot.abilities = { speed: 0, fastBullets: 0, heal: 0, glueWall: 0 };
      bot.effects = { speed: 0, fastBullets: 0 };
      bot.lastFire = 0; bot.lastAbilityUse = 0;
    }
    broadcast({ type: 'restart', mode: gameModeRef.current, players });
    initGame(players, gameModeRef.current);
  }, [broadcast, initGame]);

  // ─── DATA HANDLER ───

  const handleDataRef = useRef<(data: any, fromId: string) => void>();
  handleDataRef.current = (data: any, fromId: string) => {
    if (data.type === 'lobbyState') {
       setLobbyPlayers(data.players); 
       setGameMode(data.mode);
       if (data.mapId) setSelectedMap(data.mapId);
    }
    else if (data.type === 'start' || data.type === 'restart') {
      initGame(data.players, data.mode, data.mapId);
    }
    else if (data.type === 'update') {
      const pid = data.playerId || fromId;
      const existingState = remotePlayersRef.current.get(pid) as (PlayerState & { protectedUntil?: number }) | undefined;

      if (pid !== myIdRef.current) {
        // Merge protectedUntil: take whichever timestamp is larger (most recently set),
        // so a stale transform update can never wipe out a fresh respawn protection.
        const incomingProtection: number = (data.state as any)?.protectedUntil || 0;
        const localProtection: number = existingState?.protectedUntil || 0;
        const mergedState = {
          ...data.state,
          alive: data.state?.alive ?? existingState?.alive ?? true,
          protectedUntil: Math.max(incomingProtection, localProtection) || undefined,
        };
        remotePlayersRef.current.set(pid, mergedState);
      }

      if (isHostRef.current) {
        const hostKnownState = remotePlayersRef.current.get(fromId) as (PlayerState & { protectedUntil?: number }) | undefined;
        const stateForBroadcast = {
          ...data.state,
          protectedUntil: hostKnownState?.protectedUntil,
        };
        broadcast({ type: 'update', playerId: fromId, state: stateForBroadcast }, fromId);
      }
    }
    else if (data.type === 'fire') {
      const ownerId = data.playerId || fromId;
      if (ownerId !== myIdRef.current) {
        const b = data.bullet;
        const bs = data.bullet.weaponType === 'sniper' ? SNIPER_SPEED : (data.bullet.weaponType === 'smg' ? SMG_SPEED : (data.fast ? FAST_BULLET_SPEED : BULLET_SPEED));
        bulletsRef.current.push({ id: b.id, x: b.x, y: b.y, vx: Math.cos(b.angle) * bs, vy: Math.sin(b.angle) * bs, ownerId, weaponType: b.weaponType });
      }
      if (isHostRef.current) broadcast({ type: 'fire', playerId: fromId, bullet: data.bullet, fast: data.fast }, fromId);
    }
    else if (data.type === 'died' && isHostRef.current) { handleKillEvent(data.killerId, fromId); }
    else if (data.type === 'kill') {
      scoresRef.current[data.killerId] = (scoresRef.current[data.killerId] || 0) + 1;
      setUiScores({ ...scoresRef.current });
      addKillFeed(data.killerId, data.victimId);
      if (data.killerId === myIdRef.current) SFX.kill();
      if (data.victimId === myIdRef.current) SFX.death();
      const victimState = remotePlayersRef.current.get(data.victimId);
      if (victimState) {
        spawnParticles(victimState.x, victimState.y, playerDataRef.current.find(p => p.id === data.victimId)?.color || '#fff', 15, 3);
        victimState.alive = false;
        // Clear any lingering spawn protection so it doesn't carry over to the next life
        (victimState as PlayerState & { protectedUntil?: number }).protectedUntil = undefined;
        remotePlayersRef.current.set(data.victimId, victimState);
      }
      if (data.victimId === myIdRef.current) {
        aliveRef.current = false;
        setUiAlive(false);
        hitFlashRef.current = Date.now();
      }
    }
    else if (data.type === 'respawn') {
      if (data.playerId === myIdRef.current) {
        myPlayerRef.current = { x: data.x, y: data.y, angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' };
        aliveRef.current = true;
        spawnProtectionUntilRef.current = resolveProtectionUntil(data);
        setUiAlive(true);
        setUiHealth(MAX_HEALTH);
      } else {
        remotePlayersRef.current.set(data.playerId, { x: data.x, y: data.y, angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default', protectedUntil: resolveProtectionUntil(data) } as PlayerState & { protectedUntil?: number });
      }
    }
    else if (data.type === 'powerupSpawn') { powerupsRef.current.push(data.powerup); }
    else if (data.type === 'powerupCollected') {
      powerupsRef.current = powerupsRef.current.filter(p => p.id !== data.powerupId);
      if (data.playerId === myIdRef.current) { collectAbility(data.powerupType); SFX.powerup(); }
      else {
        const rp = remotePlayersRef.current.get(data.playerId);
        if (rp) {
          if (data.powerupType === 'weapon_smg') rp.weapon = 'smg';
          else if (data.powerupType === 'weapon_sniper') rp.weapon = 'sniper';
          remotePlayersRef.current.set(data.playerId, rp);
        }
      }
    }
    else if (data.type === 'wallPlaced') { glueWallsRef.current.push(data.wall); }
    else if (data.type === 'wallDestroyed') { glueWallsRef.current = glueWallsRef.current.filter(w => w.id !== data.wallId); }
    else if (data.type === 'grenadePlaced') {
      if (!grenadesRef.current.some(g => g.id === data.grenade.id)) {
        grenadesRef.current.push(data.grenade);
      }
    }
    else if (data.type === 'grenadeSync') {
      const synced = new Map(data.grenades.map(g => [g.id, g]));
      grenadesRef.current = grenadesRef.current
        .map(existing => {
          const next = synced.get(existing.id);
          return next ? { ...existing, ...next } : existing;
        })
        .filter(g => synced.has(g.id));
    }
    else if (data.type === 'grenadeExploded') { grenadesRef.current = grenadesRef.current.filter(g => g.id !== data.grenadeId); }
    else if (data.type === 'scoreUpdate') {
      scoresRef.current = data.scores; setUiScores({ ...data.scores });
      if (data.teamScores) { teamScoresRef.current = data.teamScores; setUiTeamScores({ ...data.teamScores }); }
    }
    else if (data.type === 'timeUpdate') { timeLeftRef.current = data.timeLeft; setUiTimeLeft(data.timeLeft); }
    else if (data.type === 'gameOver') {
      SFX.gameOver();
      setGameResults(data.results);
      if (data.teamScores) setUiTeamScores(data.teamScores);
      if (data.roundScores) { roundScoresRef.current = data.roundScores; setUiRoundScores(data.roundScores); }
      setScreen('gameover');
    }
    else if (data.type === 'roundOver') {
      roundScoresRef.current = data.roundScores;
      setUiRoundScores({ ...data.roundScores });
      setUiRoundBanner(`${data.winner.toUpperCase()} wins round!`);
      SFX.roundWin();
    }
    else if (data.type === 'newRound') {
      const players = data.players;
      const roundProtectedUntil: number = data.protectedUntil || Date.now() + 3000;
      playerDataRef.current = players;
      const me = players.find((p: PlayerData) => p.id === myIdRef.current);
      if (me) { myPlayerRef.current = { ...me.state }; setMyColor(me.color); }
      // Apply spawn protection for the local player on new round
      spawnProtectionUntilRef.current = roundProtectedUntil;
      remotePlayersRef.current.clear();
      players.forEach((p: PlayerData) => {
        if (p.id !== myIdRef.current)
          remotePlayersRef.current.set(p.id, { ...p.state, alive: true, protectedUntil: roundProtectedUntil } as PlayerState & { protectedUntil?: number });
      });
      bulletsRef.current = []; powerupsRef.current = []; glueWallsRef.current = []; grenadesRef.current = []; blastRingsRef.current = [];
      botGrenadeLastThrowRef.current = {};
      abilitiesRef.current = { speed: 0, fastBullets: 0, heal: 0, glueWall: 0 };
      effectsRef.current = { speed: 0, fastBullets: 0 };
      aliveRef.current = true;
      setUiHealth(MAX_HEALTH); setUiAlive(true);
      setUiAbilities({ speed: 0, fastBullets: 0, heal: 0, glueWall: 0 });
      grenadeLastThrowAtRef.current = 0;
      setUiGrenades(grenadeInventoryRef.current);
      setUiRoundBanner(null);
    }
    else if (data.type === 'collectPowerup' && isHostRef.current) {
      const pu = powerupsRef.current.find(p => p.id === data.powerupId);
      if (pu) {
        powerupsRef.current = powerupsRef.current.filter(p => p.id !== data.powerupId);
        broadcast({ type: 'powerupCollected', powerupId: data.powerupId, playerId: fromId, powerupType: pu.type });
      }
    }
    else if (data.type === 'placeWall' && isHostRef.current) {
      const wall = { ...data.wall, createdAt: Date.now() };
      glueWallsRef.current.push(wall);
      broadcast({ type: 'wallPlaced', wall }, fromId);
    }
    else if (data.type === 'throwGrenade' && isHostRef.current) {
      const grenade = { ...data.grenade, createdAt: Date.now(), armedAt: data.grenade.armedAt || Date.now() + GRENADE_MIN_ARM_MS, vx: data.grenade.vx || 0, vy: data.grenade.vy || 0, exploded: false };
      if (!grenadesRef.current.some(g => g.id === grenade.id)) {
        grenadesRef.current.push(grenade);
      }
      broadcast({ type: 'grenadePlaced', grenade }, fromId);
    }
    else if (data.type === 'myName') {
      playerNamesRef.current[fromId] = data.name;
      if (isHostRef.current) {
        setLobbyPlayers(prev => {
          const updated = prev.map(p => p.id === fromId ? { ...p, name: data.name } : p);
          broadcast({
            type: 'lobbyState',
            players: updated,
            mode: gameModeRef.current,
            mapId: selectedMap,
          });
          return updated;
        });
      }
    }
    else if (data.type === 'chat') {
      const msg = {
        id: (Math.random() * 1e9 | 0).toString(36),
        sender: data.senderName,
        text: data.text,
        color: data.color
      };
      setLobbyChatMessages(prev => [...prev, msg]);
      if (isHostRef.current) broadcast(data, fromId);
    }
  };

  useEffect(() => {
    onData((data: any, fromId: string) => handleDataRef.current?.(data, fromId));
  }, [onData]);

  const handleSendChat = useCallback((text: string) => {
    const me = lobbyPlayers.find(p => p.id === myIdRef.current) || { name: settings.username || 'Player', color: '#00ff88' };
    const senderName = me.name || (myIdRef.current === soloIdRef.current ? settings.username : 'Player');
    const color = me.color;
    
    const id = (Math.random() * 1e9 | 0).toString(36);
    const networkMsg = { type: 'chat' as const, playerId: myIdRef.current, text, senderName, color };
    
    setLobbyChatMessages(prev => [...prev, { id, sender: senderName, text, color }]);
    
    if (isHost) broadcastNetwork(networkMsg);
    else sendData(networkMsg);
  }, [lobbyPlayers, settings.username, isHost, sendData]);

  // Use a ref-wrapped broadcast for callback stability if needed, 
  // but we can just use the broadcast from usePeer
  const broadcastNetwork = broadcast;

  const collectAbility = (type: string) => {
    if (type === 'speed') abilitiesRef.current.speed += 1;
    else if (type === 'fastBullets') abilitiesRef.current.fastBullets += 1;
    else if (type === 'heal') abilitiesRef.current.heal += 1;
    else if (type === 'glueWall') abilitiesRef.current.glueWall += 1;
    else if (type === 'weapon_smg') myPlayerRef.current.weapon = 'smg';
    else if (type === 'weapon_sniper') myPlayerRef.current.weapon = 'sniper';
  };

  // ─── COLLISION UTILITIES ───

  const getObstacles = () => activeMapRef.current.obstacles;

  const collidesWithGlueWall = (x: number, y: number, radius: number): boolean => {
    for (const wall of glueWallsRef.current) {
      if (lineIntersectsCircle(wall.x1, wall.y1, wall.x2, wall.y2, x, y, radius)) return true;
    }
    return false;
  };

  const resolveGlueWallCollision = (x: number, y: number, radius: number, dx: number, dy: number): { x: number; y: number; collided: boolean } => {
    if (!collidesWithGlueWall(x, y, radius)) return { x, y, collided: false };
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const tx = x + Math.cos(angle) * radius;
      const ty = y + Math.sin(angle) * radius;
      if (!collidesWithGlueWall(tx, ty, radius)) {
        return { x: Math.max(radius, Math.min(ARENA_W - radius, tx)), y: Math.max(radius, Math.min(ARENA_H - radius, ty)), collided: true };
      }
    }
    const ox = x - dx * radius;
    const oy = y - dy * radius;
    if (!collidesWithGlueWall(ox, oy, radius)) {
      return { x: Math.max(radius, Math.min(ARENA_W - radius, ox)), y: Math.max(radius, Math.min(ARENA_H - radius, oy)), collided: true };
    }
    return { x, y, collided: true };
  };

  const getAllLivingPlayerPositions = useCallback(() => {
    const players: Array<{ id: string; x: number; y: number; alive: boolean }> = [];
    players.push({ id: myIdRef.current, x: myPlayerRef.current.x, y: myPlayerRef.current.y, alive: aliveRef.current });
    for (const [id, state] of remotePlayersRef.current.entries()) {
      players.push({ id, x: state.x, y: state.y, alive: state.alive !== false });
    }
    return players;
  }, []);

  const explodeGrenade = useCallback((grenade: Grenade) => {
    if (grenade.exploded) return;
    grenade.exploded = true;
    grenadesRef.current = grenadesRef.current.filter(g => g.id !== grenade.id);
    blastRingsRef.current.push({
      id: `blast-${grenade.id}`,
      x: grenade.x,
      y: grenade.y,
      radius: grenade.blastRadius,
      createdAt: Date.now(),
    });
    spawnParticles(grenade.x, grenade.y, '#ff4444', 34, 6);
    SFX.grenadeBlast();
    const players = getAllLivingPlayerPositions();
    for (const p of players) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - grenade.x, p.y - grenade.y) <= grenade.blastRadius) {
        handleKillEvent(grenade.ownerId, p.id);
      }
    }
    broadcast({ type: 'grenadeExploded', grenadeId: grenade.id });
  }, [broadcast, getAllLivingPlayerPositions, handleKillEvent]);

  const broadcastBotStates = useCallback(() => {
    if (!isHostRef.current || botsRef.current.length === 0) return;

    // Send bot transforms at the same cadence as player transforms so non-host
    // clients receive bot movement/health/alive updates consistently.
    // We must include protectedUntil so non-host clients respect spawn protection.
    for (const bot of botsRef.current) {
      const botState = remotePlayersRef.current.get(bot.id) as (PlayerState & { protectedUntil?: number }) | undefined;
      if (!botState) continue;
      broadcast({ type: 'update', playerId: bot.id, state: { ...botState, protectedUntil: botState.protectedUntil } });
    }
  }, [broadcast]);

  // ─── GAME LOOP ───

  useEffect(() => {
    if (screen !== 'playing') return;
    let fc = 0;
    const loop = () => {
      if (scrRef.current !== 'playing') return;
      update();
      render();
      if (++fc % 1 === 0) { // Every frame: smoother transforms for networked sessions.
        const state = { ...myPlayerRef.current };
        if (isHostRef.current) {
          broadcast({ type: 'update', playerId: myIdRef.current, state });
          broadcastBotStates();
        } else {
          sendData({ type: 'update', state });
        }
      }
      afRef.current = requestAnimationFrame(loop);
    };
    afRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(afRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastBotStates, screen]);

  // Host/Solo timer
  useEffect(() => {
    if (!(isHost || isSolo) || screen !== 'playing') return;
    const iv = setInterval(() => {
      timeLeftRef.current -= 1;
      setUiTimeLeft(timeLeftRef.current);
      broadcast({ type: 'timeUpdate', timeLeft: timeLeftRef.current });
      if (timeLeftRef.current <= 0) endGame();
    }, 1000);
    return () => clearInterval(iv);
  }, [isHost, isSolo, screen, broadcast, endGame]);

  // Host/Solo powerup spawning
  useEffect(() => {
    if (!(isHost || isSolo) || screen !== 'playing') return;
    const iv = setInterval(() => {
      if (powerupsRef.current.length < 3) {
        const obs = getObstacles();
        const types: Array<Powerup['type']> = ['speed', 'fastBullets', 'heal', 'glueWall', 'weapon_smg', 'weapon_sniper'];
        const type = types[Math.floor(Math.random() * types.length)];
        let x: number, y: number;
        do {
          x = 80 + Math.random() * (ARENA_W - 160);
          y = 80 + Math.random() * (ARENA_H - 160);
        } while (ptInObsDynamic(x, y, obs) || collidesWithGlueWall(x, y, POWERUP_R));
        const powerup: Powerup = { id: (Math.random() * 1e9 | 0).toString(36), x, y, type };
        powerupsRef.current.push(powerup);
        broadcast({ type: 'powerupSpawn', powerup });
      }
    }, POWERUP_SPAWN_INTERVAL);
    return () => clearInterval(iv);
  }, [isHost, isSolo, screen, broadcast]);

  // Host/Solo wall cleanup
  useEffect(() => {
    if (!(isHost || isSolo) || screen !== 'playing') return;
    const iv = setInterval(() => {
      const now = Date.now();
      glueWallsRef.current = glueWallsRef.current.filter(w => {
        if (now - w.createdAt > GLUE_WALL_DURATION || w.health <= 0) {
          broadcast({ type: 'wallDestroyed', wallId: w.id }); return false;
        }
        return true;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [isHost, isSolo, screen, broadcast]);

  // UI state sync
  useEffect(() => {
    if (screen !== 'playing') return;
    const iv = setInterval(() => {
      setUiHealth(myPlayerRef.current.health);
      setUiAbilities({ ...abilitiesRef.current });
      setUiGrenades(grenadeInventoryRef.current);
      const now = Date.now();
      const sr = effectsRef.current.speed > 0 ? Math.max(0, Math.ceil((ABILITY_DURATION - (now - effectsRef.current.speed)) / 1000)) : 0;
      const fr = effectsRef.current.fastBullets > 0 ? Math.max(0, Math.ceil((ABILITY_DURATION - (now - effectsRef.current.fastBullets)) / 1000)) : 0;
      if (sr === 0 && effectsRef.current.speed > 0) effectsRef.current.speed = 0;
      if (fr === 0 && effectsRef.current.fastBullets > 0) effectsRef.current.fastBullets = 0;
      setUiEffectTimes({ speed: sr, fastBullets: fr });
    }, 200);
    return () => clearInterval(iv);
  }, [screen]);

  useEffect(() => () => { disconnect(); cancelAnimationFrame(afRef.current); }, [disconnect]);

  useEffect(() => {
    if (connected || error) setIsJoining(false);
    // Send username to host when connected
    if (connected && settings.username) {
      sendData({ type: 'myName', name: settings.username });
    }
  }, [connected, error, settings.username, sendData]);

  // Auto-join from QR code URL
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && !roomCode && roomParam.length === 4) {
      handleJoinWithLoading(roomParam);
    }
  }, [searchParams, roomCode, handleJoinWithLoading]);

  // Auto-start matchmaking game based on user selection
  useEffect(() => {
    if (!isMatchmakingMode) return;
    if (screen !== 'lobby') return;
    if (searchParams.get('room')) return;
    
    const parsedGameMode = (searchParams.get('gameMode') as GameMode) || 'tdm';
    const parsedTeamSize = searchParams.get('teamSize') || 'squad';
    const parsedPartySize = Math.min(4, Math.max(1, Number(searchParams.get('partySize') || '1')));

    const shuffledNames = [...MATCHMAKING_BOT_NAMES].sort(() => Math.random() - 0.5);
    const playerName = user?.name || settings.username || 'Player';
    const rawKD = stats ? (stats.total_deaths === 0 ? stats.total_kills : stats.total_kills / stats.total_deaths) : 0;
    const effectiveKD = Math.max(rawKD - (hasPendingMatchmakingPenalty && rawKD > 0.1 ? 0.1 : 0), 0);
    const teamBotConfigs: Array<{ team: 'green' | 'red'; tier: BotTier; name: string }> = [];
    const randomTeamTier = (): BotTier => ([1, 2, 3, 4][Math.floor(Math.random() * 4)] as BotTier);
    const getOpponentTierPool = (kd: number): BotTier[] => {
      if (kd >= 4) return [4];
      if (kd >= 3) return [3, 4];
      if (kd >= 2) return [3, 4, 2];
      if (kd >= 1) return [2, 3];
      if (kd >= 0.5) return [1, 2];
      return [1];
    };
    const opponentTierPool = getOpponentTierPool(effectiveKD);
    const randomOpponentTier = (): BotTier => opponentTierPool[Math.floor(Math.random() * opponentTierPool.length)];

    const teamTargetSize = parsedTeamSize === 'duo' && parsedPartySize <= 2 ? 2 : 4;
    const friendlyBotCount = Math.max(0, teamTargetSize - parsedPartySize);
    const enemyBotCount = teamTargetSize;
    let nameIndex = 0;
    for (let i = 0; i < friendlyBotCount; i++) {
      teamBotConfigs.push({ team: 'green', tier: randomTeamTier(), name: shuffledNames[nameIndex++] });
    }
    for (let i = 0; i < enemyBotCount; i++) {
      teamBotConfigs.push({ team: 'red', tier: randomOpponentTier(), name: shuffledNames[nameIndex++] });
    }

    isSoloRef.current = true;
    setIsSolo(true);
    myIdRef.current = soloIdRef.current;
    roundScoresRef.current = { green: 0, red: 0 };
    setUiRoundScores({ green: 0, red: 0 });
    deathCountsRef.current = {};
    setDeathCounts({});
    const map = getMapById('classic');
    activeMapRef.current = map;
    setSelectedMap('classic');
    const sp = map.spawnPoints;
    playerNamesRef.current[soloIdRef.current] = playerName;
    
    // User is always green team in matchmaking
    const players: import('@/types/game').PlayerData[] = [
      {
        id: soloIdRef.current, number: 1,
        color: '#00ff88', team: 'green',
        state: { ...sp[0], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
        alive: true, score: 0, name: playerName,
      },
    ];

    let greenCount = 1;
    let redCount = 0;

    const botConfigs: Array<{ id: string; tier: BotTier }> = [];
    teamBotConfigs.forEach((tbc, i) => {
      const botId = `bot-${i + 1}`;
      playerNamesRef.current[botId] = tbc.name;
      
      const isGreen = tbc.team === 'green';
      const spawnIdx = isGreen ? greenCount * 2 : 1 + redCount * 2;
      if (isGreen) greenCount++; else redCount++;

      players.push({
        id: botId, number: i + 2,
        color: isGreen ? '#00ff88' : '#ff4466',
        team: tbc.team,
        state: { ...sp[spawnIdx % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
        alive: true, score: 0, name: tbc.name,
      });
      botConfigs.push({ id: botId, tier: tbc.tier });
    });

    botsRef.current = botConfigs.map(bc => createBotState(bc.id, bc.tier));
    initGame(players, parsedGameMode, 'classic', botConfigs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMatchmakingMode, searchParams, user?.name, settings.username, stats, hasPendingMatchmakingPenalty, initGame, screen]);

  useEffect(() => {
    if (!isMatchmakingMode) return;
    if (screen !== 'lobby') return;
    if (!searchParams.get('room')) return;
    if (!isHost || !connected || !roomCode) return;

    const parsedPartySize = Math.min(4, Math.max(1, Number(searchParams.get('partySize') || '1')));
    if (lobbyPlayers.length < parsedPartySize) return;
    if (matchmakingAutoStartedRef.current) return;
    matchmakingAutoStartedRef.current = true;

    roundScoresRef.current = { green: 0, red: 0 };
    setUiRoundScores({ green: 0, red: 0 });
    deathCountsRef.current = {};
    setDeathCounts({});

    const parsedGameMode = (searchParams.get('gameMode') as GameMode) || 'tdm';
    const parsedTeamSize = searchParams.get('teamSize') || 'squad';
    const map = getMapById('classic');
    activeMapRef.current = map;
    setSelectedMap('classic');
    const sp = map.spawnPoints;

    const rawKD = stats ? (stats.total_deaths === 0 ? stats.total_kills : stats.total_kills / stats.total_deaths) : 0;
    const effectiveKD = Math.max(rawKD - (hasPendingMatchmakingPenalty && rawKD > 0.1 ? 0.1 : 0), 0);
    const getOpponentTierPool = (kd: number): BotTier[] => {
      if (kd >= 4) return [4];
      if (kd >= 3) return [3, 4];
      if (kd >= 2) return [3, 4, 2];
      if (kd >= 1) return [2, 3];
      if (kd >= 0.5) return [1, 2];
      return [1];
    };
    const randomTeamTier = (): BotTier => ([1, 2, 3, 4][Math.floor(Math.random() * 4)] as BotTier);
    const opponentTierPool = getOpponentTierPool(effectiveKD);
    const randomOpponentTier = (): BotTier => opponentTierPool[Math.floor(Math.random() * opponentTierPool.length)];

    const teamTargetSize = parsedTeamSize === 'duo' && parsedPartySize <= 2 ? 2 : 4;
    const friendlyBotCount = Math.max(0, teamTargetSize - lobbyPlayers.length);
    const enemyBotCount = teamTargetSize;
    const shuffledNames = [...MATCHMAKING_BOT_NAMES].sort(() => Math.random() - 0.5);
    let nameIndex = 0;

    const players: PlayerData[] = lobbyPlayers.map((lp, idx) => ({
      id: lp.id,
      number: idx + 1,
      color: '#00ff88',
      team: 'green',
      state: { ...sp[(idx * 2) % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
      alive: true,
      score: 0,
      name: lp.name,
    }));

    const botConfigs: Array<{ id: string; tier: BotTier }> = [];
    for (let i = 0; i < friendlyBotCount; i++) {
      const botId = `bot-f-${i + 1}`;
      const botName = shuffledNames[nameIndex++];
      players.push({
        id: botId,
        number: players.length + 1,
        color: '#00ff88',
        team: 'green',
        state: { ...sp[(players.length * 2) % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
        alive: true,
        score: 0,
        name: botName,
      });
      botConfigs.push({ id: botId, tier: randomTeamTier() });
    }
    for (let i = 0; i < enemyBotCount; i++) {
      const botId = `bot-r-${i + 1}`;
      const botName = shuffledNames[nameIndex++];
      players.push({
        id: botId,
        number: players.length + 1,
        color: '#ff4466',
        team: 'red',
        state: { ...sp[(1 + i * 2) % sp.length], angle: 0, health: MAX_HEALTH, alive: true, weapon: 'default' },
        alive: true,
        score: 0,
        name: botName,
      });
      botConfigs.push({ id: botId, tier: randomOpponentTier() });
    }

    botsRef.current = botConfigs.map((bc) => createBotState(bc.id, bc.tier));
    broadcast({ type: 'start', mode: parsedGameMode, players, mapId: 'classic' } as any);
    initGame(players, parsedGameMode, 'classic', botConfigs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMatchmakingMode, screen, searchParams, isHost, connected, roomCode, lobbyPlayers, stats, hasPendingMatchmakingPenalty, broadcast, initGame]);

  // ─── UPDATE ───

  const update = () => {
    const isDeadSpectating = !aliveRef.current && gameModeRef.current === 'classic';
    if (!aliveRef.current && !isDeadSpectating) return;
    const p = myPlayerRef.current;
    const now = Date.now();
    const obs = getObstacles();

    // Only process player input if alive
    if (aliveRef.current) {
    const speedActive = effectsRef.current.speed > 0 && now - effectsRef.current.speed < ABILITY_DURATION;
    const fastActive = effectsRef.current.fastBullets > 0 && now - effectsRef.current.fastBullets < ABILITY_DURATION;
    const spd = speedActive ? FAST_PLAYER_SPEED : PLAYER_SPEED;

    let targetX = p.x + moveInRef.current.x * spd;
    let targetY = p.y + moveInRef.current.y * spd;
    targetX = Math.max(PLAYER_R, Math.min(ARENA_W - PLAYER_R, targetX));
    targetY = Math.max(PLAYER_R, Math.min(ARENA_H - PLAYER_R, targetY));

    if (!collidesObsDynamic(targetX, targetY, PLAYER_R, obs)) {
      p.x = targetX; p.y = targetY;
    } else {
      if (!collidesObsDynamic(targetX, p.y, PLAYER_R, obs)) p.x = targetX;
      if (!collidesObsDynamic(p.x, targetY, PLAYER_R, obs)) p.y = targetY;
    }

    if (collidesWithGlueWall(p.x, p.y, PLAYER_R)) {
      const resolved = resolveGlueWallCollision(p.x, p.y, PLAYER_R, moveInRef.current.x, moveInRef.current.y);
      p.x = resolved.x; p.y = resolved.y;
    }

    // Aim and fire
    const ax = aimInRef.current.x, ay = aimInRef.current.y;
    const isAiming = ax !== 0 || ay !== 0;

    if (isAiming) {
      p.angle = Math.atan2(ay, ax);

      if (settings.aimAssist) {
        let bestTargetAngle = null;
        let smallestDiff = 0.4; // roughly 23 degrees pull radius

        for (const [id, rp] of remotePlayersRef.current) {
          if (rp.alive === false) continue;
          
          if (gameModeRef.current === 'tdm' || gameModeRef.current === 'classic') {
            const myTeam = playerDataRef.current.find(d => d.id === myIdRef.current)?.team;
            const rpTeam = playerDataRef.current.find(d => d.id === id)?.team;
            if (myTeam && rpTeam === myTeam) continue;
          }

          const dx = rp.x - p.x;
          const dy = rp.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 500) continue; // ignore very far targets

          const angleToEnemy = Math.atan2(dy, dx);
          let diff = Math.abs(p.angle - angleToEnemy);
          diff = diff % (Math.PI * 2);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;

          if (diff < smallestDiff) {
            let hasLOS = true;
            for (let step = 15; step < dist; step += 25) {
              const cx = p.x + Math.cos(angleToEnemy) * step;
              const cy = p.y + Math.sin(angleToEnemy) * step;
              if (ptInObsDynamic(cx, cy, obs) || collidesWithGlueWall(cx, cy, 10)) {
                hasLOS = false;
                break;
              }
            }
            if (hasLOS) {
              smallestDiff = diff;
              bestTargetAngle = angleToEnemy;
            }
          }
        }

        if (bestTargetAngle !== null) {
          // Aim assist pull: stronger (0.92) for sniper when locked on, normal (0.6) otherwise
          const isSniperWeapon = p.weapon === 'sniper';
          const sniperOnTarget = isSniperWeapon && (() => {
            const sx = p.x + Math.cos(p.angle) * (PLAYER_R + 12);
            const sy = p.y + Math.sin(p.angle) * (PLAYER_R + 12);
            const ex = p.x + Math.cos(p.angle) * SNIPER_RANGE;
            const ey = p.y + Math.sin(p.angle) * SNIPER_RANGE;
            for (const [, rp] of remotePlayersRef.current) {
              if (rp.alive === false) continue;
              if (lineIntersectsCircle(sx, sy, ex, ey, rp.x, rp.y, PLAYER_R + 3)) return true;
            }
            return false;
          })();
          const pullStrength = sniperOnTarget ? 0.92 : 0.6;
          let adiff = bestTargetAngle - p.angle;
          while (adiff < -Math.PI) adiff += Math.PI * 2;
          while (adiff > Math.PI) adiff -= Math.PI * 2;
          p.angle += adiff * pullStrength;
        }
      }
    }

    const isSniper = p.weapon === 'sniper';
    const isSMG = p.weapon === 'smg';
    
    let cooldown = fastActive ? FIRE_COOLDOWN * 0.5 : FIRE_COOLDOWN;
    if (isSMG) cooldown = SMG_COOLDOWN;
    if (isSniper) cooldown = SNIPER_COOLDOWN;

    const canFire = now - lastFireRef.current > cooldown;
    
    let shouldFire = false;
    if (isSniper) {
      // Sniper fires on release
      if (wasAimingRef.current && !isAiming) {
        if (canFire) {
          shouldFire = true;
        }
        wasAimingRef.current = false;
      } else if (isAiming) {
        wasAimingRef.current = true;
      }
    } else {
      // Other weapons fire while aiming
      if (isAiming && canFire) {
        shouldFire = true;
      }
      wasAimingRef.current = false;
    }

    if (shouldFire) {
      lastFireRef.current = now;
      SFX.shoot();
      const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
      const bx = p.x + cos * (PLAYER_R + 4), by = p.y + sin * (PLAYER_R + 4);
      const id = (Math.random() * 1e9 | 0).toString(36);
      
      let bs = fastActive ? FAST_BULLET_SPEED : BULLET_SPEED;
      if (isSMG) bs = SMG_SPEED;
      if (isSniper) bs = SNIPER_SPEED;

      bulletsRef.current.push({ id, x: bx, y: by, vx: cos * bs, vy: sin * bs, ownerId: myIdRef.current, weaponType: p.weapon });
      const bulletMsg = { type: 'fire' as const, bullet: { id, x: bx, y: by, angle: p.angle, weaponType: p.weapon }, fast: fastActive };
      if (isHostRef.current) broadcast({ ...bulletMsg, playerId: myIdRef.current });
      else sendData(bulletMsg);
    }

    // Powerup collection
    const collected: string[] = [];
    powerupsRef.current.forEach(pu => {
      if ((p.x - pu.x) ** 2 + (p.y - pu.y) ** 2 < (PLAYER_R + POWERUP_R) ** 2) {
        collected.push(pu.id);
        SFX.powerup();
        if (isHostRef.current) {
          collectAbility(pu.type);
          broadcast({ type: 'powerupCollected', powerupId: pu.id, playerId: myIdRef.current, powerupType: pu.type });
        } else { sendData({ type: 'collectPowerup', powerupId: pu.id }); collectAbility(pu.type); }
      }
    });
    if (collected.length) powerupsRef.current = powerupsRef.current.filter(pu => !collected.includes(pu.id));
    } // end alive check

    // Bullets
    bulletsRef.current = bulletsRef.current.filter(b => {
      b.x += b.vx; b.y += b.vy;
      if (b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) return false;
      if (ptInObsDynamic(b.x, b.y, obs)) return false;

      for (const w of glueWallsRef.current) {
        if (distToSegment(b.x, b.y, w.x1, w.y1, w.x2, w.y2) < BULLET_R + 4) {
          w.health -= 1; return false;
        }
      }

      if (isHostRef.current) {
        for (const grenade of grenadesRef.current) {
          if (grenade.exploded || b.ownerId === grenade.ownerId) continue;
          if ((b.x - grenade.x) ** 2 + (b.y - grenade.y) ** 2 <= (BULLET_R + 8) ** 2) {
            explodeGrenade(grenade);
            return false;
          }
        }
      }

      if (b.ownerId !== myIdRef.current && aliveRef.current) {
        // Skip if bullet owner is teammate
        const isTeamModeCheck = gameModeRef.current === 'tdm' || gameModeRef.current === 'classic';
        const myDataCheck = playerDataRef.current.find(d => d.id === myIdRef.current);
        const ownerDataCheck = playerDataRef.current.find(d => d.id === b.ownerId);
        const isTeammateShot = isTeamModeCheck && myDataCheck?.team && ownerDataCheck?.team === myDataCheck.team;

        if (!isTeammateShot && !hasSpawnProtection(myIdRef.current) && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (PLAYER_R + BULLET_R) ** 2) {
          let damage = BULLET_DAMAGE;
          if (b.weaponType === 'smg') damage = SMG_DAMAGE;
          else if (b.weaponType === 'sniper') damage = SNIPER_DAMAGE;

          p.health = Math.max(0, p.health - damage);
          hitFlashRef.current = Date.now();
          SFX.hit();
          spawnParticles(b.x, b.y, '#ff4466', 6, 2);
          if (p.health <= 0) {
            aliveRef.current = false; setUiAlive(false);
            if (isHostRef.current) handleKillEvent(b.ownerId, myIdRef.current);
            else sendData({ type: 'died', killerId: b.ownerId });
          }
          return false;
        }
      }

      // Check remote players - skip teammates in team modes
      const isTeamMode = gameModeRef.current === 'tdm' || gameModeRef.current === 'classic';
      const bulletOwnerData = playerDataRef.current.find(d => d.id === b.ownerId);

      for (const [id, rp] of remotePlayersRef.current) {
        if (id === b.ownerId) continue;
        // Skip teammates
        if (isTeamMode && bulletOwnerData?.team) {
          const targetData = playerDataRef.current.find(d => d.id === id);
          if (targetData?.team === bulletOwnerData.team) continue;
        }
        if (rp.alive !== false && !hasSpawnProtection(id) && (b.x - rp.x) ** 2 + (b.y - rp.y) ** 2 < (PLAYER_R + BULLET_R) ** 2) {
          let damage = BULLET_DAMAGE;
          if (b.weaponType === 'smg') damage = SMG_DAMAGE;
          else if (b.weaponType === 'sniper') damage = SNIPER_DAMAGE;
          
          rp.health = Math.max(0, (rp.health || MAX_HEALTH) - damage);
          spawnParticles(b.x, b.y, '#ff8844', 6, 2);
          if (rp.health <= 0) {
            rp.alive = false;
            if (isHostRef.current) handleKillEvent(b.ownerId, id);
          }
          return false;
        }
      }
      return true;
    });

    if (isHostRef.current) {
      grenadesRef.current = grenadesRef.current.filter(grenade => {
        if (grenade.exploded) return false;
        grenade.x += grenade.vx;
        grenade.y += grenade.vy;

        if (grenade.x < 0 || grenade.x > ARENA_W || grenade.y < 0 || grenade.y > ARENA_H) return false;
        if (ptInObsDynamic(grenade.x, grenade.y, obs)) return false;
        return true;
      });

      grenadesRef.current.forEach(grenade => {
        if (grenade.exploded) return;
        const timedOut = now - grenade.armedAt >= GRENADE_AUTO_BLAST_MS;
        let triggered = timedOut;
        if (!triggered) {
          for (const target of getAllLivingPlayerPositions()) {
            if (!target.alive) continue;
            if (target.id === grenade.ownerId) continue;
            if (Math.hypot(target.x - grenade.x, target.y - grenade.y) <= grenade.triggerRadius) {
              triggered = true;
              break;
            }
          }
        }
        if (triggered) explodeGrenade(grenade);
      });

      if (!isSoloRef.current && now - grenadeSyncTickRef.current > 50) {
        grenadeSyncTickRef.current = now;
        broadcast({
          type: 'grenadeSync',
          grenades: grenadesRef.current.map(grenade => ({
            id: grenade.id,
            x: grenade.x,
            y: grenade.y,
            vx: grenade.vx,
            vy: grenade.vy,
          })),
        });
      }
    }

    blastRingsRef.current = blastRingsRef.current.filter(br => now - br.createdAt < 450);

    // Resolve remote glue wall collisions
    for (const [, rp] of remotePlayersRef.current) {
      if (rp.alive && collidesWithGlueWall(rp.x, rp.y, PLAYER_R)) {
        const resolved = resolveGlueWallCollision(rp.x, rp.y, PLAYER_R, 0, 0);
        rp.x = resolved.x; rp.y = resolved.y;
      }
    }

    // ─── BOT AI (works for both solo and multiplayer bots) ───
    if (isHostRef.current && botsRef.current.length > 0) {
      const isTeamMode = gameModeRef.current === 'tdm' || gameModeRef.current === 'classic';

      for (const bot of botsRef.current) {
        const botPlayerState = remotePlayersRef.current.get(bot.id);
        if (!botPlayerState || botPlayerState.alive === false) continue;

        const botData = playerDataRef.current.find(pd => pd.id === bot.id);
        const botTeam = botData?.team;

        // Find nearest ENEMY for this bot (skip teammates in team modes)
        let nearestEnemy: PlayerState | null = null;
        let nearestDist = Infinity;
        let enemyAlive = false;
        let enemyMoveX = 0;
        let enemyMoveY = 0;

        // Check human player
        const myData = playerDataRef.current.find(pd => pd.id === myIdRef.current);
        const isTeammate = isTeamMode && botTeam && myData?.team === botTeam;
        if (aliveRef.current && !isTeammate) {
          const d = Math.hypot(p.x - botPlayerState.x, p.y - botPlayerState.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestEnemy = myPlayerRef.current;
            enemyAlive = true;
            enemyMoveX = moveInRef.current.x;
            enemyMoveY = moveInRef.current.y;
          }
        }

        // Check other remote players/bots
        for (const [rid, rp] of remotePlayersRef.current) {
          if (rid === bot.id || rp.alive === false) continue;
          const rpData = playerDataRef.current.find(pd => pd.id === rid);
          const rpTeammate = isTeamMode && botTeam && rpData?.team === botTeam;
          if (rpTeammate) continue;
          const d = Math.hypot(rp.x - botPlayerState.x, rp.y - botPlayerState.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestEnemy = rp;
            enemyAlive = true;
            enemyMoveX = 0; enemyMoveY = 0;
          }
        }

        if (!nearestEnemy) continue; // No enemies found

        // Find the id of the nearest enemy so we can check spawn protection
        let nearestEnemyId = myIdRef.current;
        for (const [rid, rp] of remotePlayersRef.current) {
          if (rp === nearestEnemy) { nearestEnemyId = rid; break; }
        }
        const enemyProtected = hasSpawnProtection(nearestEnemyId);

        const action = updateBot({
          bot, botState: botPlayerState,
          playerState: nearestEnemy,
          playerAlive: enemyAlive && !enemyProtected,
          playerMoveX: enemyMoveX, playerMoveY: enemyMoveY,
          now, obstacles: obs,
          powerups: powerupsRef.current,
          bullets: bulletsRef.current,
          glueWalls: glueWallsRef.current,
          collidesObs: collidesObsDynamic,
          collidesGlueWall: collidesWithGlueWall,
        });

        if (action.newBullet) {
          bulletsRef.current.push(action.newBullet);
          broadcast({
            type: 'fire',
            playerId: bot.id,
            bullet: {
              id: action.newBullet.id,
              x: action.newBullet.x,
              y: action.newBullet.y,
              angle: Math.atan2(action.newBullet.vy, action.newBullet.vx),
              weaponType: action.newBullet.weaponType,
            },
            fast: false,
          });
        }
        if (action.collectedPowerupId) {
          powerupsRef.current = powerupsRef.current.filter(pp => pp.id !== action.collectedPowerupId);
          broadcast({ type: 'powerupCollected', powerupId: action.collectedPowerupId, playerId: bot.id, powerupType: action.collectedPowerupType });
        }
        if (action.placedWall) {
          glueWallsRef.current.push(action.placedWall);
          broadcast({ type: 'wallPlaced', wall: action.placedWall });
        }

        if (
          isMatchmakingMode &&
          now - botGrenadeTickRef.current > BOT_GRENADE_CONFIG.throwCheckIntervalMs &&
          nearestDist < BOT_GRENADE_CONFIG.maxThrowDistance &&
          Math.random() < BOT_GRENADE_CONFIG.throwChancePerCheck &&
          now - (botGrenadeLastThrowRef.current[bot.id] || 0) > BOT_GRENADE_CONFIG.throwCooldownMs
        ) {
          botGrenadeTickRef.current = now;
          const angleToEnemy = Math.atan2(nearestEnemy.y - botPlayerState.y, nearestEnemy.x - botPlayerState.x);
          const grenade: Grenade = {
            id: `g-${bot.id}-${(Math.random() * 1e9 | 0).toString(36)}`,
            x: botPlayerState.x + Math.cos(angleToEnemy) * (PLAYER_R + 8),
            y: botPlayerState.y + Math.sin(angleToEnemy) * (PLAYER_R + 8),
            vx: Math.cos(angleToEnemy) * GRENADE_THROW_SPEED * 0.85,
            vy: Math.sin(angleToEnemy) * GRENADE_THROW_SPEED * 0.85,
            ownerId: bot.id,
            createdAt: now,
            armedAt: now + GRENADE_MIN_ARM_MS,
            triggerRadius: GRENADE_TRIGGER_RADIUS,
            blastRadius: GRENADE_BLAST_RADIUS,
            exploded: false,
          };
          botGrenadeLastThrowRef.current[bot.id] = now;
          grenadesRef.current.push(grenade);
          broadcast({ type: 'grenadePlaced', grenade });
        }
      }
    }
  };

  // ─── RENDER ───

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const p = myPlayerRef.current;
    const obs = getObstacles();

    ctx.fillStyle = '#080d16';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    ctx.strokeStyle = 'rgba(0,255,136,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < ARENA_W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_H); ctx.stroke(); }
    for (let y = 0; y < ARENA_H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_W, y); ctx.stroke(); }

    ctx.strokeStyle = 'rgba(0,255,136,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2);

    obs.forEach(o => {
      ctx.fillStyle = '#121c2b';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(0,255,136,0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    });

    const grenadeAimLength = 130;
    const aimStartX = p.x + Math.cos(p.angle) * (PLAYER_R + 6);
    const aimStartY = p.y + Math.sin(p.angle) * (PLAYER_R + 6);
    const aimEndX = p.x + Math.cos(p.angle) * grenadeAimLength;
    const aimEndY = p.y + Math.sin(p.angle) * grenadeAimLength;
    ctx.save();
    ctx.strokeStyle = "rgba(255,80,80,0.45)";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(aimStartX, aimStartY);
    ctx.lineTo(aimEndX, aimEndY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Glue walls
    glueWallsRef.current.forEach(w => {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len;
      ctx.strokeStyle = `rgba(153,68,255,${0.3 + 0.7 * w.health / GLUE_WALL_HEALTH})`;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.quadraticCurveTo((w.x1 + w.x2) / 2 + nx * 12, (w.y1 + w.y2) / 2 + ny * 12, w.x2, w.y2);
      ctx.stroke();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#9944ff';
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // Powerups
    powerupsRef.current.forEach(pu => {
      const c = POWERUP_COLORS[pu.type] || '#fff';
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = c + '33';
      ctx.fillRect(-POWERUP_R - 2, -POWERUP_R - 2, (POWERUP_R + 2) * 2, (POWERUP_R + 2) * 2);
      ctx.fillStyle = c;
      ctx.fillRect(-POWERUP_R, -POWERUP_R, POWERUP_R * 2, POWERUP_R * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-POWERUP_R, -POWERUP_R, POWERUP_R * 2, POWERUP_R * 2);
      ctx.restore();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POWERUP_ICONS[pu.type] || '?', pu.x, pu.y);
    });

    grenadesRef.current.forEach(grenade => {
      ctx.save();
      ctx.fillStyle = 'rgba(255,68,68,0.08)';
      ctx.beginPath();
      ctx.arc(grenade.x, grenade.y, grenade.triggerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,68,68,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(grenade.x, grenade.y, grenade.triggerRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,130,130,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(grenade.x, grenade.y);
      ctx.lineTo(grenade.x - grenade.vx * 6, grenade.y - grenade.vy * 6);
      ctx.stroke();
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(grenade.x, grenade.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#330000';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', grenade.x, grenade.y);
      ctx.restore();
    });

    blastRingsRef.current.forEach(ring => {
      const t = Math.min(1, (Date.now() - ring.createdAt) / 450);
      const pulseRadius = ring.radius * (0.5 + t * 0.8);
      ctx.save();
      ctx.strokeStyle = `rgba(255,100,60,${0.8 - t * 0.8})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // Bullets
    ctx.save();
    ctx.shadowBlur = 6;
    bulletsRef.current.forEach(b => {
      const pd = playerDataRef.current.find(d => d.id === b.ownerId);
      const c = pd?.color || '#00ff88';
      ctx.fillStyle = c;
      ctx.shadowColor = c;
      const r = b.weaponType === 'sniper' ? SNIPER_BULLET_R : BULLET_R;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // Players
    // Returns the locked enemy {x, y} if sniper aim overlaps an enemy, or null
    const getSniperLockedEnemy = (x: number, y: number, angle: number): { x: number; y: number } | null => {
      const maxRange = SNIPER_RANGE;
      const sx = x + Math.cos(angle) * (PLAYER_R + 12);
      const sy = y + Math.sin(angle) * (PLAYER_R + 12);
      const ex = x + Math.cos(angle) * maxRange;
      const ey = y + Math.sin(angle) * maxRange;

      const nearestBlockedDistance = (() => {
        let nearest = Number.POSITIVE_INFINITY;

        obs.forEach((o) => {
          const hitDist = distToSegment(o.x + o.w / 2, o.y + o.h / 2, sx, sy, ex, ey);
          const hitRadius = Math.hypot(o.w, o.h) * 0.5;
          if (hitDist <= hitRadius) {
            const obsDist = Math.hypot(o.x + o.w / 2 - sx, o.y + o.h / 2 - sy);
            nearest = Math.min(nearest, obsDist);
          }
        });

        glueWallsRef.current.forEach((wall) => {
          if (!lineIntersectsCircle(wall.x1, wall.y1, wall.x2, wall.y2, sx, sy, 2)) return;
          const wx = (wall.x1 + wall.x2) / 2;
          const wy = (wall.y1 + wall.y2) / 2;
          nearest = Math.min(nearest, Math.hypot(wx - sx, wy - sy));
        });

        return nearest;
      })();

      for (const pd of playerDataRef.current) {
        if (pd.id === myIdRef.current) continue;
        const enemy = remotePlayersRef.current.get(pd.id);
        if (!enemy || enemy.alive === false || hasSpawnProtection(pd.id)) continue;
        if (!lineIntersectsCircle(sx, sy, ex, ey, enemy.x, enemy.y, PLAYER_R + 3)) continue;
        const enemyDist = Math.hypot(enemy.x - sx, enemy.y - sy);
        if (enemyDist < nearestBlockedDistance) return { x: enemy.x, y: enemy.y };
      }
      return null;
    };

    const drawP = (x: number, y: number, angle: number, color: string, num: number, isAlive: boolean, isMe: boolean, isBot: boolean = false, isProtected: boolean = false, weapon: WeaponType = 'default') => {
      if (!isAlive) ctx.globalAlpha = 0.15;
      if (isProtected) {
        const blink = 0.35 + 0.65 * Math.abs(Math.sin(Date.now() / 120));
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = `rgba(255,215,0,${blink})`;
        ctx.strokeStyle = `rgba(255,215,0,${0.55 + 0.35 * blink})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, PLAYER_R + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
      // Bot indicator ring
      if (isBot) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(x, y, PLAYER_R + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      
      const barrelLen = weapon === 'sniper' ? PLAYER_R + 14 : (weapon === 'smg' ? PLAYER_R + 6 : PLAYER_R + 8);
      ctx.strokeStyle = color; ctx.lineWidth = weapon === 'smg' ? 5 : 3;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * barrelLen, y + Math.sin(angle) * barrelLen); ctx.stroke();
      
      ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = weapon === 'sniper' ? 'N' : (weapon === 'smg' ? 'S' : (isBot ? 'B' : num.toString()));
      ctx.fillText(label, x, y + 1);

      if (isMe && isAlive) {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(x, y - PLAYER_R + 4, 4, 0, Math.PI * 2);
        ctx.fill();
        
        const aimRange = weapon === 'sniper' ? SNIPER_RANGE : (weapon === 'smg' ? SMG_RANGE : 450);
        const sniperLockedEnemy = weapon === 'sniper' ? getSniperLockedEnemy(x, y, angle) : null;
        const sniperLocked = sniperLockedEnemy !== null;
        if (sniperLocked) {
          ctx.save();
          // Steady (no blink) intense red glow on sight line
          ctx.shadowBlur = 40;
          ctx.shadowColor = 'rgba(255,0,0,1)';
          ctx.strokeStyle = 'rgba(255,20,20,1)';
          ctx.setLineDash([6, 4]); ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(angle) * (PLAYER_R + 12), y + Math.sin(angle) * (PLAYER_R + 12));
          ctx.lineTo(x + Math.cos(angle) * 100, y + Math.sin(angle) * 100);
          ctx.stroke();
          // Second pass for extra glow depth
          ctx.shadowBlur = 20; ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
          // Extended sight line
          ctx.shadowBlur = 30;
          ctx.strokeStyle = 'rgba(255,40,40,0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(angle) * 100, y + Math.sin(angle) * 100);
          ctx.lineTo(x + Math.cos(angle) * aimRange, y + Math.sin(angle) * aimRange);
          ctx.stroke();
          // Steady red ring around shooter
          ctx.shadowBlur = 24;
          ctx.shadowColor = 'rgba(255,0,0,1)';
          ctx.strokeStyle = 'rgba(255,0,0,0.85)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(x, y, PLAYER_R + 8, 0, Math.PI * 2); ctx.stroke();
          // Red crosshair/target marker on the enemy
          const ex = sniperLockedEnemy.x, ey = sniperLockedEnemy.y;
          const pulse = 0.7 + 0.3 * Math.abs(Math.sin(Date.now() / 200)); // gentle pulse on marker only
          ctx.shadowBlur = 28;
          ctx.shadowColor = `rgba(255,0,0,${pulse})`;
          ctx.strokeStyle = `rgba(255,0,0,${pulse})`;
          ctx.lineWidth = 2;
          // Outer circle
          ctx.beginPath(); ctx.arc(ex, ey, PLAYER_R + 6, 0, Math.PI * 2); ctx.stroke();
          // Crosshair lines
          const cSize = PLAYER_R + 12;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(ex - cSize, ey); ctx.lineTo(ex - PLAYER_R - 2, ey); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex + PLAYER_R + 2, ey); ctx.lineTo(ex + cSize, ey); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex, ey - cSize); ctx.lineTo(ex, ey - PLAYER_R - 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex, ey + PLAYER_R + 2); ctx.lineTo(ex, ey + cSize); ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = weapon === 'sniper' ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.8)';
          ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(angle) * (PLAYER_R + 12), y + Math.sin(angle) * (PLAYER_R + 12));
          ctx.lineTo(x + Math.cos(angle) * 100, y + Math.sin(angle) * 100);
          ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = weapon === 'sniper' ? 'rgba(255,100,100,0.25)' : 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(angle) * 100, y + Math.sin(angle) * 100);
          ctx.lineTo(x + Math.cos(angle) * aimRange, y + Math.sin(angle) * aimRange);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    playerDataRef.current.forEach(pd => {
      if (pd.id === myIdRef.current) return;
      const rp = remotePlayersRef.current.get(pd.id);
      if (rp && rp.alive !== false) drawP(rp.x, rp.y, rp.angle, pd.color, pd.number, true, false, pd.id.startsWith('bot-'), hasSpawnProtection(pd.id), rp.weapon);
    });

    const myData = playerDataRef.current.find(pd => pd.id === myIdRef.current);
    if (myData) drawP(p.x, p.y, p.angle, myData.color, myData.number, aliveRef.current, true, false, hasSpawnProtection(myIdRef.current), p.weapon);

    // HUD
    const hpColor = myData?.color || '#00ff88';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, 8, 160, 22);
    ctx.fillStyle = hpColor; ctx.fillRect(8, 8, 160 * p.health / MAX_HEALTH, 22);
    ctx.strokeStyle = hpColor; ctx.lineWidth = 1; ctx.strokeRect(8, 8, 160, 22);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`HP ${p.health}%`, 14, 13);

    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
    const min = Math.floor(timeLeftRef.current / 60);
    const sec = timeLeftRef.current % 60;
    ctx.fillText(`${min}:${sec.toString().padStart(2, '0')}`, ARENA_W / 2, 18);

    ctx.textAlign = 'right'; ctx.font = 'bold 14px monospace';
    ctx.fillText(`KILLS: ${scoresRef.current[myIdRef.current] || 0}`, ARENA_W - 12, 18);

    // FFA live ranking
    if (gameModeRef.current === 'ffa') {
      const ranked = playerDataRef.current
        .map(pd => ({ id: pd.id, name: getPlayerName(pd.id, pd.number), color: pd.color, score: scoresRef.current[pd.id] || 0 }))
        .sort((a, b) => b.score - a.score);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const rankX = 8, rankY = 38;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(rankX, rankY, 130, ranked.length * 16 + 4);
      ranked.forEach((r, i) => {
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = r.color;
        const label = `${i + 1}. ${r.name.substring(0, 8)} ${r.score}`;
        ctx.fillText(label, rankX + 4, rankY + 2 + i * 16);
      });
    }

    if (gameModeRef.current === 'tdm') {
      ctx.textAlign = 'center'; ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#00ff88'; ctx.fillText(`GREEN: ${teamScoresRef.current.green}`, ARENA_W / 2 - 80, 42);
      ctx.fillStyle = '#ff4466'; ctx.fillText(`RED: ${teamScoresRef.current.red}`, ARENA_W / 2 + 80, 42);
    }

    if (gameModeRef.current === 'classic') {
      ctx.textAlign = 'center'; ctx.font = 'bold 15px monospace';
      ctx.fillStyle = '#00ff88'; ctx.fillText(`GREEN ${roundScoresRef.current.green}`, ARENA_W / 2 - 80, 42);
      ctx.fillStyle = '#fff'; ctx.fillText(`ROUNDS`, ARENA_W / 2, 42);
      ctx.fillStyle = '#ff4466'; ctx.fillText(`${roundScoresRef.current.red} RED`, ARENA_W / 2 + 80, 42);
      ctx.fillStyle = '#888'; ctx.font = 'bold 12px monospace';
      ctx.fillText(`First to ${CLASSIC_WIN_ROUNDS}`, ARENA_W / 2, 58);
    }

    if ((gameModeRef.current === 'tdm' || gameModeRef.current === 'classic') && myData?.team) {
      playerDataRef.current.forEach(pd => {
        if (pd.id === myIdRef.current || pd.team !== myData.team) return;
        const rp = remotePlayersRef.current.get(pd.id);
        if (rp && rp.alive !== false) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(rp.x - 15, rp.y - PLAYER_R - 12, 30, 5);
          ctx.fillStyle = pd.color; ctx.fillRect(rp.x - 15, rp.y - PLAYER_R - 12, 30 * (rp.health || MAX_HEALTH) / MAX_HEALTH, 5);
        }
      });
    }

    // Particles
    const pNow = Date.now();
    particlesRef.current = particlesRef.current.filter(pt => {
      pt.x += pt.vx; pt.y += pt.vy;
      pt.vx *= 0.95; pt.vy *= 0.95;
      pt.life -= 1 / 60 / pt.maxLife;
      if (pt.life <= 0) return false;
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2); ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1;

    // Hit flash
    if (pNow - hitFlashRef.current < 200) {
      const flashAlpha = 0.3 * (1 - (pNow - hitFlashRef.current) / 200);
      ctx.fillStyle = `rgba(255,50,50,${flashAlpha})`;
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    }

    // Death overlay
    if (!aliveRef.current) {
      ctx.fillStyle = 'rgba(255,0,0,0.15)'; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
      ctx.fillStyle = '#ff4466'; ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (gameModeRef.current === 'classic') {
        ctx.fillText('ELIMINATED — SPECTATING', ARENA_W / 2, ARENA_H / 2);
        ctx.fillStyle = '#aaa'; ctx.font = '16px monospace';
        ctx.fillText('Watching live match...', ARENA_W / 2, ARENA_H / 2 + 35);
      } else {
        ctx.fillText('RESPAWNING...', ARENA_W / 2, ARENA_H / 2);
      }
    }

    // Kill feed cleanup (for ref only, rendered as React component)
    const feedNow = Date.now();
    killFeedRef.current = killFeedRef.current.filter(k => feedNow - k.time < 5000);
  };

  // ─── INPUT ───

  const handleMove = useCallback((x: number, y: number) => { moveInRef.current = { x, y }; }, []);
  const handleAim = useCallback((x: number, y: number) => { aimInRef.current = { x, y }; }, []);

  const useSpeed = useCallback(() => {
    if (abilitiesRef.current.speed > 0) { abilitiesRef.current.speed -= 1; effectsRef.current.speed = Date.now(); SFX.abilityUse(); }
  }, []);
  const useFastBullets = useCallback(() => {
    if (abilitiesRef.current.fastBullets > 0) { abilitiesRef.current.fastBullets -= 1; effectsRef.current.fastBullets = Date.now(); SFX.abilityUse(); }
  }, []);
  const useHeal = useCallback(() => {
    if (abilitiesRef.current.heal > 0) {
      abilitiesRef.current.heal -= 1;
      myPlayerRef.current.health = Math.min(MAX_HEALTH, myPlayerRef.current.health + 30);
      setUiHealth(myPlayerRef.current.health);
      SFX.abilityUse();
    }
  }, []);
  const usePlaceWall = useCallback(() => {
    if (abilitiesRef.current.glueWall > 0) {
      abilitiesRef.current.glueWall -= 1;
      const p = myPlayerRef.current;
      const dist = 60;
      const cx = p.x + Math.cos(p.angle) * dist;
      const cy = p.y + Math.sin(p.angle) * dist;
      const perp = p.angle + Math.PI / 2;
      const half = GLUE_WALL_WIDTH / 2;
      const wall: GlueWall = {
        id: (Math.random() * 1e9 | 0).toString(36),
        x1: cx + Math.cos(perp) * half, y1: cy + Math.sin(perp) * half,
        x2: cx - Math.cos(perp) * half, y2: cy - Math.sin(perp) * half,
        health: GLUE_WALL_HEALTH, ownerId: myIdRef.current, createdAt: Date.now(),
      };
      let canPlace = true;
      if (lineIntersectsCircle(wall.x1, wall.y1, wall.x2, wall.y2, p.x, p.y, PLAYER_R)) canPlace = false;
      for (const [, rp] of remotePlayersRef.current) {
        if (rp.alive && lineIntersectsCircle(wall.x1, wall.y1, wall.x2, wall.y2, rp.x, rp.y, PLAYER_R)) {
          canPlace = false; break;
        }
      }
      if (canPlace) {
        glueWallsRef.current.push(wall);
        SFX.wallPlace();
        if (isHostRef.current) broadcast({ type: 'wallPlaced', wall });
        else sendData({ type: 'placeWall', wall });
      } else {
        abilitiesRef.current.glueWall += 1;
      }
    }
  }, [broadcast, sendData]);

  const useGrenade = useCallback(() => {
    const now = Date.now();
    if (now - grenadeLastThrowAtRef.current < GRENADE_BUTTON_COOLDOWN_MS) return;
    if (!aliveRef.current) return;
    if (grenadeInventoryRef.current <= 0) return;
    grenadeLastThrowAtRef.current = now;

    grenadeInventoryRef.current -= 1;
    grenadesThrownByMeRef.current += 1;
    setUiGrenades(grenadeInventoryRef.current);

    const p = myPlayerRef.current;
    const throwDistance = PLAYER_R + 10;
    const throwVx = Math.cos(p.angle) * GRENADE_THROW_SPEED;
    const throwVy = Math.sin(p.angle) * GRENADE_THROW_SPEED;
    const grenade: Grenade = {
      id: `g-${myIdRef.current}-${(Math.random() * 1e9 | 0).toString(36)}`,
      x: p.x + Math.cos(p.angle) * throwDistance,
      y: p.y + Math.sin(p.angle) * throwDistance,
      vx: throwVx,
      vy: throwVy,
      ownerId: myIdRef.current,
      createdAt: now,
      armedAt: now + GRENADE_MIN_ARM_MS,
      triggerRadius: GRENADE_TRIGGER_RADIUS,
      blastRadius: GRENADE_BLAST_RADIUS,
      exploded: false,
    };
    SFX.wallPlace();
    if (isHostRef.current) {
      grenadesRef.current.push(grenade);
      broadcast({ type: 'grenadePlaced', grenade });
      broadcast({ type: 'grenadeSync', grenades: [{ id: grenade.id, x: grenade.x, y: grenade.y, vx: grenade.vx, vy: grenade.vy }] });
    } else {
      grenadesRef.current.push(grenade);
      sendData({ type: 'throwGrenade', grenade });
    }
  }, [broadcast, sendData]);

  // ─── PAUSE MENU HELPERS ───

  const handleBackToLobby = useCallback(() => {
    setShowPauseMenu(false);
    cancelAnimationFrame(afRef.current);
    setScreen('lobby');
  }, []);

  const handleExitGame = useCallback(() => {
    setShowPauseMenu(false);
    cancelAnimationFrame(afRef.current);
    disconnect();
    navigate('/');
  }, [disconnect, navigate]);

  const getPausePlayerStats = () => {
    return playerDataRef.current.map(pd => ({
      id: pd.id,
      name: getPlayerName(pd.id, pd.number),
      color: pd.color,
      team: pd.team,
      kills: scoresRef.current[pd.id] || 0,
      deaths: deathCountsRef.current[pd.id] || 0,
      alive: pd.id === myIdRef.current ? aliveRef.current : (remotePlayersRef.current.get(pd.id)?.alive !== false),
    }));
  };

  // ─── SCREENS ───

  if (screen === 'lobby') {
    return (
      <div className="h-[100dvh] bg-background overflow-hidden">
        <button onClick={() => navigate('/')} className="absolute top-3 left-3 text-muted-foreground font-mono text-xs hover:text-foreground transition-colors z-10">
          ← BACK
        </button>
        <Lobby
          roomCode={roomCode} isHost={isHost} players={lobbyPlayers} mode={gameMode}
          onModeChange={handleModeChange} onTeamSwap={handleTeamSwap} onStart={handleStartGame}
          onCreateRoom={createRoom} onJoinRoom={handleJoinWithLoading} onSoloPlay={startSoloGame}
          error={error} myId={myId} isJoining={isJoining}
          selectedMap={selectedMap} onMapChange={setSelectedMap}
          onOpenSettings={() => setShowSettings(true)} username={settings.username}
          onAddBot={handleAddBot} onRemoveBot={handleRemoveBot} botCount={lobbyBots.length}
          chatMessages={lobbyChatMessages} onSendChat={handleSendChat}
        />
        {showSettings && (
          <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />
        )}
      </div>
    );
  }

  if (screen === 'gameover') {
    return (
      <Scoreboard
        results={gameResults} mode={gameMode} teamScores={uiTeamScores}
        roundScores={uiRoundScores}
        onReplay={handleReplay} onMenu={() => navigate('/')} isHost={isHost || isSolo}
      />
    );
  }

  const jSize = settings.joystickSize;
  const bSize = settings.abilityButtonSize;
  const moveJoystick = <Joystick onMove={settings.swapJoysticks ? handleAim : handleMove} label={settings.swapJoysticks ? 'AIM & FIRE' : 'MOVE'} color={myColor} size={jSize} disabled={isEditingControls} />;
  const aimJoystick = <Joystick onMove={settings.swapJoysticks ? handleMove : handleAim} label={settings.swapJoysticks ? 'MOVE' : 'AIM & FIRE'} color={myColor} size={jSize} disabled={isEditingControls} />;

  return (
    <div className="fixed inset-0 bg-background flex select-none overflow-hidden" style={{ touchAction: 'none', height: '100dvh' }}>
      {/* Pause button */}
      <button
        onClick={() => setShowPauseMenu(true)}
        className="absolute top-1 left-1 z-30 w-8 h-8 flex items-center justify-center rounded bg-black/50 border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        style={{ pointerEvents: 'auto' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <button
        onClick={() => setIsEditingControls(prev => !prev)}
        className={`absolute top-1 right-1 z-30 px-2 h-8 flex items-center justify-center rounded border font-mono text-[10px] tracking-wider ${isEditingControls ? 'bg-primary/20 border-primary text-primary' : 'bg-black/50 border-border/50 text-muted-foreground hover:text-foreground'}`}
        style={{ pointerEvents: 'auto' }}
      >
        {isEditingControls ? 'DONE' : 'EDIT UI'}
      </button>

      <div
        className="absolute z-20"
        style={{
          left: controlPositions.leftButtons.x,
          top: controlPositions.leftButtons.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
        }}
        onPointerDown={isEditingControls ? (e) => {
          const startX = e.clientX;
          const startY = e.clientY;
          const startPos = controlPositions.leftButtons;
          const onMove = (ev: PointerEvent) => updateControlPosition('leftButtons', startPos.x + ev.clientX - startX, startPos.y + ev.clientY - startY);
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        } : undefined}
      >
        <div className="flex gap-1">
          <AbilityButton icon={<Heart className="w-3.5 h-3.5" />} count={uiAbilities.heal} onClick={isEditingControls ? () => {} : useHeal} color="#00ff44" size={bSize} />
          <AbilityButton icon={<Shield className="w-3.5 h-3.5" />} count={uiAbilities.glueWall} onClick={isEditingControls ? () => {} : usePlaceWall} color="#9944ff" size={bSize} />
        </div>
      </div>

      <div
        className="absolute z-20"
        style={{
          left: controlPositions.move.x,
          top: controlPositions.move.y - (jSize / 2 + bSize + 14),
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
        }}
      >
        <AbilityButton icon={<Bomb className="w-3.5 h-3.5" />} count={uiGrenades} onClick={isEditingControls ? () => {} : useGrenade} color="#ff3b3b" size={bSize} />
      </div>

      <div
        className="absolute z-20"
        style={{
          left: controlPositions.move.x,
          top: controlPositions.move.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
        }}
        onPointerDown={isEditingControls ? (e) => {
          const startX = e.clientX;
          const startY = e.clientY;
          const startPos = controlPositions.move;
          const onMove = (ev: PointerEvent) => updateControlPosition('move', startPos.x + ev.clientX - startX, startPos.y + ev.clientY - startY);
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        } : undefined}
      >
        {moveJoystick}
      </div>

      {/* Center - Canvas + Kill Feed */}
      <div className="flex-1 flex items-center justify-center min-w-0 p-0.5 relative">
        <canvas
          ref={canvasRef} width={ARENA_W} height={ARENA_H}
          className="rounded border border-border"
          style={{ width: `${settings.gameFieldScale}%`, maxWidth: '100%', maxHeight: '100%', aspectRatio: `${ARENA_W}/${ARENA_H}`, objectFit: 'contain' }}
        />
        <KillFeedComponent entries={uiKillFeed} />
      </div>

      <div
        className="absolute z-20"
        style={{
          left: controlPositions.rightButtons.x,
          top: controlPositions.rightButtons.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
        }}
        onPointerDown={isEditingControls ? (e) => {
          const startX = e.clientX;
          const startY = e.clientY;
          const startPos = controlPositions.rightButtons;
          const onMove = (ev: PointerEvent) => updateControlPosition('rightButtons', startPos.x + ev.clientX - startX, startPos.y + ev.clientY - startY);
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        } : undefined}
      >
        <div className="flex gap-1">
          <AbilityButton icon={<Zap className="w-3.5 h-3.5" />} count={uiAbilities.speed} active={uiEffectTimes.speed > 0} timeLeft={uiEffectTimes.speed} onClick={isEditingControls ? () => {} : useSpeed} color="#ffdd00" size={bSize} />
          <AbilityButton icon={<Crosshair className="w-3.5 h-3.5" />} count={uiAbilities.fastBullets} active={uiEffectTimes.fastBullets > 0} timeLeft={uiEffectTimes.fastBullets} onClick={isEditingControls ? () => {} : useFastBullets} color="#ff8800" size={bSize} />
        </div>
      </div>

      <div
        className="absolute z-20"
        style={{
          left: controlPositions.aim.x,
          top: controlPositions.aim.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
        }}
        onPointerDown={isEditingControls ? (e) => {
          const startX = e.clientX;
          const startY = e.clientY;
          const startPos = controlPositions.aim;
          const onMove = (ev: PointerEvent) => updateControlPosition('aim', startPos.x + ev.clientX - startX, startPos.y + ev.clientY - startY);
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        } : undefined}
      >
        {aimJoystick}
      </div>

      {isEditingControls && (
        <div className="absolute top-10 right-1 z-30 px-2 py-1 rounded bg-black/70 border border-border/50 font-mono text-[9px] text-muted-foreground">
          Drag joysticks/buttons to set custom positions (auto-saved)
        </div>
      )}

      {/* Round banner overlay */}
      {uiRoundBanner && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="bg-black/80 px-6 py-3 rounded-lg border border-primary/50">
            <p className="font-display text-lg font-black text-primary tracking-widest animate-pulse">{uiRoundBanner}</p>
          </div>
        </div>
      )}

      {/* Pause menu */}
      {showPauseMenu && (
        <PauseMenu
          players={getPausePlayerStats()}
          onResume={() => setShowPauseMenu(false)}
          onExitGame={handleExitGame}
          onBackToLobby={!isSolo ? handleBackToLobby : undefined}
          isSolo={isSolo}
        />
      )}
    </div>
  );
};

export default Game;
