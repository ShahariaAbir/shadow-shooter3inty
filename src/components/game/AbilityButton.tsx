import type { ReactNode } from 'react';



interface AbilityButtonProps {
  icon: ReactNode;
  count: number;
  active?: boolean;
  timeLeft?: number;
  onClick: () => void;
  color: string;
  size?: number;
}

const AbilityButton = ({ icon, count, active, timeLeft, onClick, color, size = 36 }: AbilityButtonProps) => {
  const badgeSize = Math.max(14, Math.round(size * 0.38));
  if (count <= 0 && !active) return null;
  return (
    <button
      onTouchStart={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => { e.stopPropagation(); onClick(); }}
      className="relative rounded-full border-2 flex items-center justify-center text-xs font-bold select-none"
      style={{
        width: size,
        height: size,
        borderColor: active ? color : color + '66',
        backgroundColor: active ? color + '44' : 'rgba(0,0,0,0.6)',
        color: color,
        touchAction: 'manipulation',
        pointerEvents: 'auto',
        animation: active ? 'pulse 1s infinite' : undefined,
      }}
    >
      {active ? `${timeLeft}` : icon}
      {count > 1 && !active && (
        <span
          className="absolute text-[8px] rounded-full flex items-center justify-center font-bold"
          style={{
            top: -Math.round(badgeSize * 0.25),
            right: -Math.round(badgeSize * 0.25),
            width: badgeSize,
            height: badgeSize,
            backgroundColor: color,
            color: '#000',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export default AbilityButton;
