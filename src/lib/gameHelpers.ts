import { OBSTACLES, SPAWN_POINTS } from '@/types/game';

export function circleRect(cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number) {
  const clx = Math.max(rx, Math.min(cx, rx + rw));
  const cly = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - clx) ** 2 + (cy - cly) ** 2 < cr * cr;
}

export function collidesObs(x: number, y: number, r: number) {
  return OBSTACLES.some(o => circleRect(x, y, r, o.x, o.y, o.w, o.h));
}

export function ptInObs(x: number, y: number) {
  return OBSTACLES.some(o => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
}

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * dx, nearY = y1 + t * dy;
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}

export function getRandomSpawn() {
  return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
}

// Add this new function for glue wall collision detection
export function lineIntersectsCircle(
  x1: number, y1: number,
  x2: number, y2: number,
  cx: number, cy: number,
  r: number
): boolean {
  // Check if either endpoint is inside the circle
  const d1 = Math.hypot(x1 - cx, y1 - cy);
  const d2 = Math.hypot(x2 - cx, y2 - cy);
  if (d1 <= r || d2 <= r) return true;

  // Check if the line segment intersects the circle
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDiscriminant) / (2 * a);
  const t2 = (-b + sqrtDiscriminant) / (2 * a);

  // Check if intersection points are within the line segment
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}
