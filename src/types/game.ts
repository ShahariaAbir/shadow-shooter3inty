export interface PlayerState {
  x: number;
  y: number;
  angle: number;
  health: number;
  alive?: boolean;
  weapon: WeaponType;
}

export interface PlayerData {
  id: string;
  number: number;
  color: string;
  team?: 'green' | 'red';
  state: PlayerState;
  alive: boolean;
  score: number;
  name?: string;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  weaponType: WeaponType;
}

export interface Grenade {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  createdAt: number;
  armedAt: number;
  triggerRadius: number;
  blastRadius: number;
  exploded?: boolean;
}

export type WeaponType = 'default' | 'smg' | 'sniper';

export interface Powerup {
  id: string;
  x: number;
  y: number;
  type: 'speed' | 'fastBullets' | 'heal' | 'glueWall' | 'weapon_smg' | 'weapon_sniper';
}

export interface GlueWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  health: number;
  ownerId: string;
  createdAt: number;
}

export interface GameResult {
  id: string;
  number: number;
  color: string;
  team?: 'green' | 'red';
  score: number;
  name?: string;
}

export interface LobbyPlayer {
  id: string;
  number: number;
  color: string;
  team?: 'green' | 'red';
  name?: string;
}

export type GameMode = 'ffa' | 'tdm' | 'classic';

export const CLASSIC_WIN_ROUNDS = 7;

export type GameMessage =
  | { type: 'update'; playerId?: string; state: PlayerState }
  | { type: 'fire'; playerId?: string; bullet: { id: string; x: number; y: number; angle: number; weaponType: WeaponType }; fast?: boolean }
  | { type: 'died'; killerId: string }
  | { type: 'collectPowerup'; powerupId: string }
  | { type: 'placeWall'; wall: GlueWall }
  | { type: 'lobbyState'; players: LobbyPlayer[]; mode: GameMode; mapId?: string }
  | { type: 'start'; mode: GameMode; players: PlayerData[] }
  | { type: 'kill'; killerId: string; victimId: string }
  | { type: 'respawn'; playerId: string; x: number; y: number }
  | { type: 'powerupSpawn'; powerup: Powerup }
  | { type: 'powerupCollected'; powerupId: string; playerId: string; powerupType: string }
  | { type: 'wallPlaced'; wall: GlueWall }
  | { type: 'wallDestroyed'; wallId: string }
  | { type: 'scoreUpdate'; scores: Record<string, number>; teamScores?: { green: number; red: number } }
  | { type: 'timeUpdate'; timeLeft: number }
  | { type: 'gameOver'; results: GameResult[]; teamScores?: { green: number; red: number }; roundScores?: { green: number; red: number } }
  | { type: 'restart'; mode: GameMode; players: PlayerData[] }
  | { type: 'roundOver'; winner: 'green' | 'red'; roundScores: { green: number; red: number } }
  | { type: 'newRound'; players: PlayerData[] }
  | { type: 'myName'; name: string }
  | { type: 'chat'; playerId: string; text: string; senderName: string; color: string }
  | { type: 'throwGrenade'; grenade: Grenade }
  | { type: 'grenadePlaced'; grenade: Grenade }
  | { type: 'grenadeSync'; grenades: Array<Pick<Grenade, 'id' | 'x' | 'y' | 'vx' | 'vy'>> }
  | { type: 'grenadeExploded'; grenadeId: string };

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ARENA_W = 1600;
export const ARENA_H = 900;
export const PLAYER_R = 16;
export const BULLET_R = 4;
export const BULLET_SPEED = 8;
export const FAST_BULLET_SPEED = 20;
export const PLAYER_SPEED = 3.5;
export const FAST_PLAYER_SPEED = 6;
export const BULLET_DAMAGE = 25;
export const MAX_HEALTH = 100;
export const FIRE_COOLDOWN = 180;
export const RESPAWN_TIME = 3000;
export const GAME_DURATION = 420;
export const TDM_WIN_SCORE = 40;
export const ABILITY_DURATION = 5000;
export const GLUE_WALL_DURATION = 30000;
export const GLUE_WALL_HEALTH = 10;
export const GLUE_WALL_WIDTH = 60;
export const POWERUP_SPAWN_INTERVAL = 12000;
export const POWERUP_R = 10;
export const GRENADE_TRIGGER_RADIUS = 80;
export const GRENADE_BLAST_RADIUS = 110;
export const GRENADE_AUTO_BLAST_MS = 4000;
export const GRENADE_THROW_SPEED = 11;
export const GRENADE_MIN_ARM_MS = 350;

// Weapon Constants
export const SMG_COOLDOWN = 100;
export const SMG_RANGE = 400;
export const SMG_DAMAGE = 19;
export const SMG_SPEED = 10;

export const SNIPER_COOLDOWN = 1000;
export const SNIPER_RANGE = 1900;
export const SNIPER_DAMAGE = 100;
export const SNIPER_SPEED = 60;
export const SNIPER_BULLET_R = 4;

export const PLAYER_COLORS = [
  '#00ff88', '#4488ff', '#ffaa00', '#ff44ff',
  '#44ffff', '#ff8844', '#88ff44', '#ff88ff',
  '#ffff44', '#ff6644',
];

export const SPAWN_POINTS = [
  { x: 100, y: 100 }, { x: ARENA_W - 100, y: 100 },
  { x: 100, y: ARENA_H - 100 }, { x: ARENA_W - 100, y: ARENA_H - 100 },
  { x: ARENA_W / 2, y: 100 }, { x: ARENA_W / 2, y: ARENA_H - 100 },
  { x: 100, y: ARENA_H / 2 }, { x: ARENA_W - 100, y: ARENA_H / 2 },
  { x: ARENA_W / 4, y: ARENA_H / 4 }, { x: 3 * ARENA_W / 4, y: 3 * ARENA_H / 4 },
];

export const OBSTACLES: Obstacle[] = [
  { x: 200, y: 150, w: 100, h: 100 },
  { x: 500, y: 100, w: 80, h: 140 },
  { x: 350, y: 350, w: 140, h: 50 },
  { x: 750, y: 250, w: 100, h: 100 },
  { x: 150, y: 500, w: 80, h: 120 },
  { x: 600, y: 480, w: 120, h: 80 },
  { x: 900, y: 120, w: 60, h: 160 },
  { x: 450, y: 600, w: 100, h: 80 },
  { x: 1050, y: 300, w: 100, h: 100 },
  { x: 1250, y: 150, w: 80, h: 120 },
  { x: 1100, y: 550, w: 120, h: 60 },
  { x: 1350, y: 400, w: 80, h: 100 },
  { x: 800, y: 700, w: 140, h: 50 },
  { x: 300, y: 750, w: 100, h: 60 },
  { x: 1400, y: 700, w: 80, h: 80 },
];
