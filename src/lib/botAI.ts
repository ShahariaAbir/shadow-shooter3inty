import {
  ARENA_W, ARENA_H, PLAYER_R, BULLET_R, BULLET_SPEED, FAST_BULLET_SPEED,
  PLAYER_SPEED, FAST_PLAYER_SPEED, FIRE_COOLDOWN, MAX_HEALTH,
  ABILITY_DURATION, GLUE_WALL_HEALTH, GLUE_WALL_WIDTH, POWERUP_R,
  SMG_COOLDOWN, SMG_RANGE, SNIPER_COOLDOWN, SNIPER_RANGE,
  SMG_SPEED, SNIPER_SPEED,
} from '@/types/game';
import type { PlayerState, Bullet, Powerup, GlueWall, Obstacle, WeaponType } from '@/types/game';
import { lineIntersectsCircle } from '@/lib/gameHelpers';

export type BotTier = 1 | 2 | 3 | 4;

export interface BotState {
  id: string;
  tier: BotTier;
  moveDir: number;
  lastDirChange: number;
  lastFire: number;
  targetPowerup: string | null;
  abilities: { speed: number; fastBullets: number; heal: number; glueWall: number };
  effects: { speed: number; fastBullets: number };
  lastAbilityUse: number;
  dodgeDir: number;
  lastDodge: number;
  lastPos: { x: number; y: number };
  lastPosTime: number;
  isHiding: boolean;
  // Stuck detection state
  stuckCheckPos: { x: number; y: number };
  stuckCheckTime: number;
  unstuckAttempts: number;
}

export function createBotState(id: string, tier: BotTier): BotState {
  return {
    id, tier,
    moveDir: 0, lastDirChange: 0, lastFire: 0,
    targetPowerup: null,
    abilities: { speed: 0, fastBullets: 0, heal: 0, glueWall: 0 },
    effects: { speed: 0, fastBullets: 0 },
    lastAbilityUse: 0,
    dodgeDir: 0, lastDodge: 0,
    lastPos: { x: 0, y: 0 },
    lastPosTime: 0,
    isHiding: false,
    stuckCheckPos: { x: 0, y: 0 },
    stuckCheckTime: 0,
    unstuckAttempts: 0,
  };
}

interface BotUpdateParams {
  bot: BotState;
  botState: PlayerState;
  playerState: PlayerState;
  playerAlive: boolean;
  playerMoveX: number;
  playerMoveY: number;
  now: number;
  obstacles: Obstacle[];
  powerups: Powerup[];
  bullets: Bullet[];
  glueWalls: GlueWall[];
  collidesObs: (x: number, y: number, r: number, obs: Obstacle[]) => boolean;
  collidesGlueWall: (x: number, y: number, r: number) => boolean;
}

export interface BotAction {
  newBullet?: { id: string; x: number; y: number; vx: number; vy: number; ownerId: string; weaponType: WeaponType };
  collectedPowerupId?: string;
  collectedPowerupType?: string;
  placedWall?: GlueWall;
}

// ── Stuck detection threshold per tier (ms) ──
const STUCK_THRESHOLD: Record<BotTier, number> = { 1: 4000, 2: 3000, 3: 2000, 4: 1500 };
const STUCK_MOVE_MIN = 15; // pixels of movement to be considered "not stuck"

export function updateBot(params: BotUpdateParams): BotAction {
  const { bot, botState, playerState, playerAlive, playerMoveX, playerMoveY, now, obstacles, powerups, bullets, collidesObs, collidesGlueWall } = params;
  const action: BotAction = {};

  const distToPlayer = Math.hypot(playerState.x - botState.x, playerState.y - botState.y);
  const botSpeedActive = bot.effects.speed > 0 && now - bot.effects.speed < ABILITY_DURATION;
  const botFastActive = bot.effects.fastBullets > 0 && now - bot.effects.fastBullets < ABILITY_DURATION;
  const botSpd = botSpeedActive ? FAST_PLAYER_SPEED : PLAYER_SPEED;
  const hp = botState.health || MAX_HEALTH;

  const isTier2 = bot.tier >= 2;
  const isTier3 = bot.tier >= 3;
  const isTier4 = bot.tier === 4;

  // ── Universal Stuck Detection (all tiers) ──
  if (bot.stuckCheckTime === 0) {
    bot.stuckCheckPos = { x: botState.x, y: botState.y };
    bot.stuckCheckTime = now;
  } else {
    const stuckDuration = STUCK_THRESHOLD[bot.tier];
    const moved = Math.hypot(botState.x - bot.stuckCheckPos.x, botState.y - bot.stuckCheckPos.y);
    if (moved > STUCK_MOVE_MIN) {
      // Moving fine, reset
      bot.stuckCheckPos = { x: botState.x, y: botState.y };
      bot.stuckCheckTime = now;
      bot.unstuckAttempts = 0;
    } else if (now - bot.stuckCheckTime > stuckDuration) {
      // Stuck! Pick escape direction biased away from center of stuck cluster
      const escapeAngle = Math.random() * Math.PI * 2;
      bot.moveDir = escapeAngle;
      bot.lastDirChange = now;
      bot.stuckCheckPos = { x: botState.x, y: botState.y };
      bot.stuckCheckTime = now;
      bot.unstuckAttempts = (bot.unstuckAttempts || 0) + 1;
    }
  }

  // ── Dodge incoming bullets (Tier 2+) ──
  if (isTier2 && now - bot.lastDodge > (isTier4 ? 150 : isTier3 ? 200 : 300)) {
    let closestBulletDist = Infinity;
    let dodgeAngle = 0;
    for (const b of bullets) {
      if (b.ownerId === bot.id) continue;
      const bDist = Math.hypot(b.x - botState.x, b.y - botState.y);
      if (bDist > (isTier4 ? 280 : 200)) continue;
      const bulletAngle = Math.atan2(b.vy, b.vx);
      const angleToBot = Math.atan2(botState.y - b.y, botState.x - b.x);
      let angleDiff = Math.abs(bulletAngle - angleToBot) % (Math.PI * 2);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
      if (angleDiff < (isTier4 ? 0.7 : 0.5) && bDist < closestBulletDist) {
        closestBulletDist = bDist;
        // T4 picks best dodge direction based on open space; others just dodge perp
        dodgeAngle = bulletAngle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
    const dodgeTriggerDist = isTier4 ? 230 : 150;
    if (closestBulletDist < dodgeTriggerDist) {
      bot.dodgeDir = dodgeAngle;
      bot.lastDodge = now;
      bot.moveDir = dodgeAngle;
      bot.lastDirChange = now;
    }
  }

  // ── Ability usage ──
  const abilityCooldown = isTier4 ? 800 : (isTier3 ? 1000 : (isTier2 ? 1200 : 2000));
  if (now - bot.lastAbilityUse > abilityCooldown) {
    const healThreshold = isTier4 ? 80 : (isTier3 ? 70 : (isTier2 ? 60 : 50));
    if (bot.abilities.heal > 0 && hp < healThreshold) {
      bot.abilities.heal -= 1;
      botState.health = Math.min(MAX_HEALTH, hp + 30);
      bot.lastAbilityUse = now;
    } else if (bot.abilities.speed > 0 && !botSpeedActive) {
      const useSpeed = isTier4
        ? (distToPlayer > 250 || distToPlayer < 120 || hp < 50)
        : (isTier3 ? (distToPlayer > 280 || distToPlayer < 110 || hp < 40)
          : (isTier2 ? (distToPlayer > 300 || distToPlayer < 100 || hp < 40)
            : (distToPlayer > 350 || distToPlayer < 80)));
      if (useSpeed) {
        bot.abilities.speed -= 1;
        bot.effects.speed = now;
        bot.lastAbilityUse = now;
      }
    } else if (bot.abilities.fastBullets > 0 && !botFastActive) {
      const useFast = isTier4 ? distToPlayer < 700 : (isTier3 ? distToPlayer < 600 : (isTier2 ? distToPlayer < 500 : distToPlayer < 300));
      if (useFast) {
        bot.abilities.fastBullets -= 1;
        bot.effects.fastBullets = now;
        bot.lastAbilityUse = now;
      }
    } else if (bot.abilities.glueWall > 0 && playerAlive) {
      const useWall = isTier4
        ? (distToPlayer < 300 && hp < 80)
        : (isTier3 ? (distToPlayer < 280 && hp < 75)
          : (isTier2 ? (distToPlayer < 250 && hp < 70)
            : (distToPlayer < 150)));
      if (useWall) {
        bot.abilities.glueWall -= 1;
        bot.lastAbilityUse = now;
        const angleToPlayer = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
        const wallDist = isTier4 ? 55 : (isTier3 ? 52 : (isTier2 ? 50 : 40));
        const cx = botState.x + Math.cos(angleToPlayer) * wallDist;
        const cy = botState.y + Math.sin(angleToPlayer) * wallDist;
        const perp = angleToPlayer + Math.PI / 2;
        const half = GLUE_WALL_WIDTH / 2;
        const wall: GlueWall = {
          id: 'bw' + (Math.random() * 1e9 | 0).toString(36),
          x1: cx + Math.cos(perp) * half, y1: cy + Math.sin(perp) * half,
          x2: cx - Math.cos(perp) * half, y2: cy - Math.sin(perp) * half,
          health: GLUE_WALL_HEALTH, ownerId: bot.id, createdAt: now,
        };
        if (!lineIntersectsCircle(wall.x1, wall.y1, wall.x2, wall.y2, botState.x, botState.y, PLAYER_R)) {
          action.placedWall = wall;
        }
      }
    }
  }

  // ── Powerup collection ──
  let movingToPowerup = false;
  if (powerups.length > 0) {
    let nearest = powerups[0];
    let nearestDist = Math.hypot(nearest.x - botState.x, nearest.y - botState.y);
    for (const pu of powerups) {
      const d = Math.hypot(pu.x - botState.x, pu.y - botState.y);
      if ((isTier2 || isTier4) && hp < 50 && pu.type === 'heal') {
        if (d < nearestDist || nearest.type !== 'heal') { nearest = pu; nearestDist = d; }
      } else if (d < nearestDist) { nearest = pu; nearestDist = d; }
    }
    const chaseRange = isTier4 ? 1000 : (isTier3 ? 800 : (isTier2 ? 350 : 250));
    const shouldChase = nearestDist < chaseRange || (hp < 40 && nearest.type === 'heal');
    const forceHealChase = (isTier3 || isTier4) && hp < 30 && nearest.type === 'heal';
    const chaseWeapon = botState.weapon === 'default' && nearest.type.startsWith('weapon_');

    if ((shouldChase || forceHealChase || chaseWeapon) && (distToPlayer > 120 || nearestDist < 80)) {
      bot.moveDir = Math.atan2(nearest.y - botState.y, nearest.x - botState.x);
      movingToPowerup = true;
      if (nearestDist < PLAYER_R + POWERUP_R) {
        if (nearest.type === 'weapon_smg') botState.weapon = 'smg';
        else if (nearest.type === 'weapon_sniper') botState.weapon = 'sniper';
        else bot.abilities[nearest.type] = (bot.abilities[nearest.type] || 0) + 1;
        action.collectedPowerupId = nearest.id;
        action.collectedPowerupType = nearest.type;
      }
    }
  }

  // ── T4: Object/Wall Awareness ──
  // T4 bots actively route around obstacles and don't press into walls
  const checkObstacleAhead = (angle: number, dist: number = 40): boolean => {
    const checkX = botState.x + Math.cos(angle) * dist;
    const checkY = botState.y + Math.sin(angle) * dist;
    return collidesObs(checkX, checkY, PLAYER_R + 5, obstacles) || collidesGlueWall(checkX, checkY, PLAYER_R + 5);
  };

  // ── Movement direction selection ──
  const dirChangeCooldown = isTier4 ? 300 + Math.random() * 300 : (isTier3 ? 400 + Math.random() * 400 : (isTier2 ? 500 + Math.random() * 600 : 800 + Math.random() * 1000));
  if (!movingToPowerup && now - bot.lastDirChange > dirChangeCooldown) {
    bot.lastDirChange = now;
    const isSniper = botState.weapon === 'sniper';
    const isSMG = botState.weapon === 'smg';

    if (isTier4) {
      // T4: Most intelligent - constantly repositions, avoids obstacles, attacks relentlessly
      if (hp < 25) {
        // Emergency retreat but keep firing
        const awayAngle = Math.atan2(botState.y - playerState.y, botState.x - playerState.x);
        const retreatAngle = awayAngle + (Math.random() - 0.5) * 0.6;
        bot.moveDir = checkObstacleAhead(retreatAngle, 50)
          ? retreatAngle + Math.PI / 2
          : retreatAngle;
      } else if (isSniper) {
        // Sniper T4: precise long range, always in optimal zone
        if (distToPlayer < 500) {
          const awayAngle = Math.atan2(botState.y - playerState.y, botState.x - playerState.x);
          bot.moveDir = awayAngle + (Math.random() - 0.5) * 0.3;
        } else if (distToPlayer > 850) {
          bot.moveDir = Math.atan2(playerState.y - botState.y, playerState.x - botState.x) + (Math.random() - 0.5) * 0.2;
        } else {
          // Strafe keeping distance
          const side = Math.random() > 0.5 ? 1 : -1;
          bot.moveDir = Math.atan2(playerState.y - botState.y, playerState.x - botState.x) + (Math.PI / 2) * side + (Math.random() - 0.5) * 0.2;
        }
      } else if (isSMG) {
        // SMG T4: highly aggressive close combat with constant movement
        if (distToPlayer > 200) {
          bot.moveDir = Math.atan2(playerState.y - botState.y, playerState.x - botState.x) + (Math.random() - 0.5) * 0.3;
        } else {
          // Tight circle strafe
          const strafeAngle = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
          const side = Math.random() > 0.5 ? 1 : -1;
          bot.moveDir = strafeAngle + (Math.PI / 2 + 0.3) * side;
        }
      } else {
        // Default weapon: stays at medium range, keeps moving
        if (distToPlayer > 450) {
          const toPlayer = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
          bot.moveDir = toPlayer + (Math.random() - 0.5) * 0.2;
        } else if (distToPlayer < 200) {
          const awayAngle = Math.atan2(botState.y - playerState.y, botState.x - playerState.x);
          bot.moveDir = awayAngle + (Math.random() - 0.5) * 0.5;
        } else {
          // Smooth strafing with direction changes
          const strafeBase = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
          const side = Math.random() > 0.5 ? 1 : -1;
          bot.moveDir = strafeBase + (Math.PI / 2) * side + (Math.random() - 0.5) * 0.4;
        }
      }
      // T4: If obstacle ahead, deflect
      if (checkObstacleAhead(bot.moveDir, 35)) {
        const alt1 = bot.moveDir + Math.PI / 4;
        const alt2 = bot.moveDir - Math.PI / 4;
        const alt3 = bot.moveDir + Math.PI / 2;
        if (!checkObstacleAhead(alt1, 35)) bot.moveDir = alt1;
        else if (!checkObstacleAhead(alt2, 35)) bot.moveDir = alt2;
        else if (!checkObstacleAhead(alt3, 35)) bot.moveDir = alt3;
        else bot.moveDir = bot.moveDir + Math.PI; // Go back
      }
    } else if (isTier3) {
      // T3: Superior long range, better dodge
      if (hp < 30) {
        const awayAngle = Math.atan2(botState.y - playerState.y, botState.x - playerState.x);
        bot.moveDir = awayAngle + (Math.random() - 0.5) * 0.4;
      } else if (isSniper) {
        if (distToPlayer < 600) {
          bot.moveDir = Math.atan2(botState.y - playerState.y, botState.x - playerState.x) + (Math.random() - 0.5) * 0.2;
        } else if (distToPlayer > 900) {
          bot.moveDir = Math.atan2(playerState.y - botState.y, playerState.x - botState.x) + (Math.random() - 0.5) * 0.2;
        } else {
          bot.moveDir = Math.atan2(playerState.y - botState.y, playerState.x - botState.x) + (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1);
        }
      } else if (isSMG) {
        if (distToPlayer > 250) {
          bot.moveDir = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
        } else {
          bot.moveDir = Math.atan2(playerState.y - botState.y, playerState.x - botState.x) + (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1);
        }
      } else if (distToPlayer > 550) {
        const toPlayer = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
        bot.moveDir = toPlayer + (Math.random() - 0.5) * 0.2;
      } else if (distToPlayer < 400) {
        const awayAngle = Math.atan2(botState.y - playerState.y, botState.x - playerState.x);
        bot.moveDir = awayAngle + (Math.random() - 0.5) * 0.6;
      } else {
        const strafeAngle = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
        bot.moveDir = strafeAngle + (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.3;
      }
    } else if (isTier2) {
      if (distToPlayer > 400) {
        const predX = playerState.x + playerMoveX * PLAYER_SPEED * 15;
        const predY = playerState.y + playerMoveY * PLAYER_SPEED * 15;
        bot.moveDir = Math.atan2(predY - botState.y, predX - botState.x) + (Math.random() - 0.5) * 0.3;
      } else if (distToPlayer < 150) {
        const awayAngle = Math.atan2(botState.y - playerState.y, botState.x - playerState.x);
        bot.moveDir = awayAngle + (Math.random() - 0.5) * 0.8;
      } else {
        const strafeAngle = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
        const side = Math.random() > 0.5 ? 1 : -1;
        bot.moveDir = strafeAngle + (Math.PI / 2) * side + (Math.random() - 0.5) * 0.5;
      }
    } else {
      // T1
      if (distToPlayer > 300) {
        const predX = playerState.x + playerMoveX * PLAYER_SPEED * 10;
        const predY = playerState.y + playerMoveY * PLAYER_SPEED * 10;
        bot.moveDir = Math.atan2(predY - botState.y, predX - botState.x) + (Math.random() - 0.5) * 0.4;
      } else if (distToPlayer < 80) {
        bot.moveDir = Math.atan2(botState.y - playerState.y, botState.x - playerState.x) + (Math.random() - 0.5) * 0.6;
      } else {
        const strafeAngle = Math.atan2(playerState.y - botState.y, playerState.x - botState.x);
        bot.moveDir = strafeAngle + (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.4;
      }
    }
  }

  // Apply movement
  let nx = botState.x + Math.cos(bot.moveDir) * botSpd;
  let ny = botState.y + Math.sin(bot.moveDir) * botSpd;
  nx = Math.max(PLAYER_R, Math.min(ARENA_W - PLAYER_R, nx));
  ny = Math.max(PLAYER_R, Math.min(ARENA_H - PLAYER_R, ny));
  if (!collidesObs(nx, ny, PLAYER_R, obstacles) && !collidesGlueWall(nx, ny, PLAYER_R)) {
    botState.x = nx; botState.y = ny;
  } else {
    // Slide along walls
    const slideX = botState.x + Math.cos(bot.moveDir) * botSpd;
    const slideY = botState.y;
    const slideX2 = botState.x;
    const slideY2 = botState.y + Math.sin(bot.moveDir) * botSpd;
    if (!collidesObs(slideX, slideY, PLAYER_R, obstacles) && !collidesGlueWall(slideX, slideY, PLAYER_R)) {
      botState.x = Math.max(PLAYER_R, Math.min(ARENA_W - PLAYER_R, slideX));
    } else if (!collidesObs(slideX2, slideY2, PLAYER_R, obstacles) && !collidesGlueWall(slideX2, slideY2, PLAYER_R)) {
      botState.y = Math.max(PLAYER_R, Math.min(ARENA_H - PLAYER_R, slideY2));
    } else {
      // Full block - change direction
      bot.moveDir = Math.random() * Math.PI * 2;
      bot.lastDirChange = now;
    }
  }

  // ── Aiming ──
  if (isTier4) {
    // T4: Perfect leading + tiny random noise
    const weaponSpd = botState.weapon === 'sniper' ? SNIPER_SPEED : (botState.weapon === 'smg' ? SMG_SPEED : (botFastActive ? FAST_BULLET_SPEED : BULLET_SPEED));
    const timeToHit = distToPlayer / weaponSpd;
    const predX = playerState.x + playerMoveX * PLAYER_SPEED * timeToHit;
    const predY = playerState.y + playerMoveY * PLAYER_SPEED * timeToHit;
    const inaccuracy = 0.005 + Math.random() * 0.01; // very precise
    botState.angle = Math.atan2(predY - botState.y, predX - botState.x) + (Math.random() - 0.5) * inaccuracy;
  } else if (isTier3) {
    const bulletSpd = botFastActive ? FAST_BULLET_SPEED : BULLET_SPEED;
    const timeToHit = distToPlayer / bulletSpd;
    const predX = playerState.x + playerMoveX * PLAYER_SPEED * timeToHit;
    const predY = playerState.y + playerMoveY * PLAYER_SPEED * timeToHit;
    const inaccuracy = 0.01 + Math.random() * 0.02;
    botState.angle = Math.atan2(predY - botState.y, predX - botState.x) + (Math.random() - 0.5) * inaccuracy;
  } else if (isTier2) {
    const bulletSpd = botFastActive ? FAST_BULLET_SPEED : BULLET_SPEED;
    const timeToHit = distToPlayer / bulletSpd;
    const predX = playerState.x + playerMoveX * PLAYER_SPEED * timeToHit;
    const predY = playerState.y + playerMoveY * PLAYER_SPEED * timeToHit;
    const inaccuracy = 0.03 + Math.random() * 0.05;
    botState.angle = Math.atan2(predY - botState.y, predX - botState.x) + (Math.random() - 0.5) * inaccuracy;
  } else {
    const inaccuracy = 0.08 + Math.random() * 0.08;
    botState.angle = Math.atan2(playerState.y - botState.y, playerState.x - botState.x) + (Math.random() - 0.5) * inaccuracy;
  }

  // ── Firing ──
  let fireCooldown = botFastActive ? FIRE_COOLDOWN * 0.5 : (isTier4 ? FIRE_COOLDOWN * 0.6 : (isTier3 ? FIRE_COOLDOWN * 0.75 : (isTier2 ? FIRE_COOLDOWN * 0.9 : FIRE_COOLDOWN * 1.1)));
  let fireRange = isTier4 ? 1000 : (isTier3 ? 900 : (isTier2 ? (botFastActive ? 700 : 550) : (botFastActive ? 600 : 400)));
  let bulletSpd = botFastActive ? FAST_BULLET_SPEED : BULLET_SPEED;

  if (botState.weapon === 'smg') {
    fireCooldown = SMG_COOLDOWN;
    fireRange = SMG_RANGE;
    bulletSpd = SMG_SPEED;
  } else if (botState.weapon === 'sniper') {
    fireCooldown = SNIPER_COOLDOWN;
    fireRange = SNIPER_RANGE;
    bulletSpd = SNIPER_SPEED;
  }

  // T4 always fires if in range; T3 fires very frequently; others normal
  const shouldFire = playerAlive && distToPlayer < fireRange && now - bot.lastFire > fireCooldown;

  if (shouldFire) {
    bot.lastFire = now;
    const cos = Math.cos(botState.angle), sin = Math.sin(botState.angle);
    const bx = botState.x + cos * (PLAYER_R + 4), by = botState.y + sin * (PLAYER_R + 4);
    action.newBullet = {
      id: 'bb' + (Math.random() * 1e9 | 0).toString(36),
      x: bx, y: by, vx: cos * bulletSpd, vy: sin * bulletSpd, ownerId: bot.id,
      weaponType: botState.weapon,
    };
  }

  return action;
}
