import { useRef, useState, useEffect, useCallback } from 'react';

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  label: string;
  color?: string;
  size?: number;
  disabled?: boolean;
}

const Joystick = ({ onMove, label, color = '#00ff88', size = 100, disabled = false }: JoystickProps) => {
  const KNOB = Math.round(size * 0.4);
  const MAX_DIST = (size - KNOB) / 2;
  const containerRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const calc = useCallback((clientX: number, clientY: number) => {
    const dx = clientX - centerRef.current.x;
    const dy = clientY - centerRef.current.y;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DIST);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * dist;
    const ny = Math.sin(angle) * dist;
    setKnobPos({ x: nx, y: ny });
    onMoveRef.current(nx / MAX_DIST, ny / MAX_DIST);
  }, [MAX_DIST]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    const rect = containerRef.current!.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    calc(touch.clientX, touch.clientY);
  }, [calc, disabled]);

  useEffect(() => {
    const handleMove = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          e.preventDefault();
          calc(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          return;
        }
      }
    };
    const handleEnd = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          touchIdRef.current = null;
          setKnobPos({ x: 0, y: 0 });
          onMoveRef.current(0, 0);
          return;
        }
      }
    };
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [calc]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={containerRef}
        className="relative rounded-full border"
        style={{ width: size, height: size, touchAction: 'none', backgroundColor: `${color}18`, borderColor: `${color}44` }}
        onTouchStart={handleTouchStart}
      >
        <div
          className="absolute rounded-full border-2"
          style={{
            width: KNOB,
            height: KNOB,
            left: size / 2 - KNOB / 2 + knobPos.x,
            top: size / 2 - KNOB / 2 + knobPos.y,
            touchAction: 'none',
            pointerEvents: 'none',
            backgroundColor: `${color}55`,
            borderColor: color,
          }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">{label}</span>
    </div>
  );
};

export default Joystick;
