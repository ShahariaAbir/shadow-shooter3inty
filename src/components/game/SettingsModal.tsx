import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X, Save, Move, Crosshair, Heart, Shield, Zap, RefreshCw, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GameSettings } from '@/lib/settings';

type ControlKey = 'move' | 'aim' | 'leftButtons' | 'rightButtons';
type ControlPositions = Record<ControlKey, { x: number; y: number }>;

interface SettingsModalProps {
  settings: GameSettings;
  onSave: (s: GameSettings) => void;
  onClose: () => void;
}

const SettingsModal = ({ settings, onSave, onClose }: SettingsModalProps) => {
  const [username, setUsername] = useState(settings.username);
  const [joystickSize, setJoystickSize] = useState(settings.joystickSize);
  const [abilityButtonSize, setAbilityButtonSize] = useState(settings.abilityButtonSize);
  const [gameFieldScale, setGameFieldScale] = useState(settings.gameFieldScale);
  const [swapJoysticks, setSwapJoysticks] = useState(settings.swapJoysticks);
  const [aimAssist, setAimAssist] = useState(settings.aimAssist);
  
  // Layout Offsets
  const [moveJoystickOffsetX, setMoveJoystickOffsetX] = useState(settings.moveJoystickOffsetX);
  const [moveJoystickOffsetY, setMoveJoystickOffsetY] = useState(settings.moveJoystickOffsetY);
  const [aimJoystickOffsetX, setAimJoystickOffsetX] = useState(settings.aimJoystickOffsetX);
  const [aimJoystickOffsetY, setAimJoystickOffsetY] = useState(settings.aimJoystickOffsetY);
  const [leftButtonsOffsetX, setLeftButtonsOffsetX] = useState(settings.leftButtonsOffsetX);
  const [leftButtonsOffsetY, setLeftButtonsOffsetY] = useState(settings.leftButtonsOffsetY);
  const [rightButtonsOffsetX, setRightButtonsOffsetX] = useState(settings.rightButtonsOffsetX);
  const [rightButtonsOffsetY, setRightButtonsOffsetY] = useState(settings.rightButtonsOffsetY);
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [controlPositions, setControlPositions] = useState<ControlPositions>({
    move: { x: 96, y: 0 },
    aim: { x: 0, y: 0 },
    leftButtons: { x: 96, y: 0 },
    rightButtons: { x: 0, y: 0 },
  });

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
  }, []);

  useEffect(() => {
    const nextSettings: GameSettings = {
      ...settings,
      joystickSize,
      abilityButtonSize,
      moveJoystickOffsetX,
      moveJoystickOffsetY,
      aimJoystickOffsetX,
      aimJoystickOffsetY,
      leftButtonsOffsetX,
      leftButtonsOffsetY,
      rightButtonsOffsetX,
      rightButtonsOffsetY,
    };

    const defaults = getDefaultControlPositions(nextSettings);
    setControlPositions({
      move: { x: settings.moveControlX ?? defaults.move.x, y: settings.moveControlY ?? defaults.move.y },
      aim: { x: settings.aimControlX ?? defaults.aim.x, y: settings.aimControlY ?? defaults.aim.y },
      leftButtons: { x: settings.leftButtonsX ?? defaults.leftButtons.x, y: settings.leftButtonsY ?? defaults.leftButtons.y },
      rightButtons: { x: settings.rightButtonsX ?? defaults.rightButtons.x, y: settings.rightButtonsY ?? defaults.rightButtons.y },
    });
  }, [
    settings,
    joystickSize,
    abilityButtonSize,
    moveJoystickOffsetX,
    moveJoystickOffsetY,
    aimJoystickOffsetX,
    aimJoystickOffsetY,
    leftButtonsOffsetX,
    leftButtonsOffsetY,
    rightButtonsOffsetX,
    rightButtonsOffsetY,
    getDefaultControlPositions,
  ]);

  const handleSave = () => {
    onSave({
      username: username.trim(),
      joystickSize,
      abilityButtonSize,
      gameFieldScale,
      swapJoysticks,
      aimAssist,
      moveJoystickOffsetX,
      moveJoystickOffsetY,
      aimJoystickOffsetX,
      aimJoystickOffsetY,
      leftButtonsOffsetX,
      leftButtonsOffsetY,
      rightButtonsOffsetX,
      rightButtonsOffsetY,
      moveControlX: controlPositions.move.x,
      moveControlY: controlPositions.move.y,
      aimControlX: controlPositions.aim.x,
      aimControlY: controlPositions.aim.y,
      leftButtonsX: controlPositions.leftButtons.x,
      leftButtonsY: controlPositions.leftButtons.y,
      rightButtonsX: controlPositions.rightButtons.x,
      rightButtonsY: controlPositions.rightButtons.y,
    });
    onClose();
  };

  const updateControlPosition = (key: ControlKey, x: number, y: number) => {
    const maxX = window.innerWidth - 24;
    const maxY = window.innerHeight - 24;
    const clampedX = Math.max(24, Math.min(x, maxX));
    const clampedY = Math.max(24, Math.min(y, maxY));
    setControlPositions(prev => ({ ...prev, [key]: { x: clampedX, y: clampedY } }));
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, key: ControlKey) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = controlPositions[key];
    const onMove = (ev: PointerEvent) => updateControlPosition(key, startPos.x + ev.clientX - startX, startPos.y + ev.clientY - startY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const resetToDefaults = () => {
    setUsername('Player');
    setJoystickSize(120);
    setAbilityButtonSize(48);
    setGameFieldScale(100);
    setSwapJoysticks(false);
    setAimAssist(true);
    setMoveJoystickOffsetX(0);
    setMoveJoystickOffsetY(0);
    setAimJoystickOffsetX(0);
    setAimJoystickOffsetY(0);
    setLeftButtonsOffsetX(0);
    setLeftButtonsOffsetY(0);
    setRightButtonsOffsetX(0);
    setRightButtonsOffsetY(0);
    
    // Default positions will be re-calculated by the useEffect
    const tempSettings = { ...settings, joystickSize: 120, abilityButtonSize: 48, moveJoystickOffsetX: 0, moveJoystickOffsetY: 0, aimJoystickOffsetX: 0, aimJoystickOffsetY: 0, leftButtonsOffsetX: 0, leftButtonsOffsetY: 0, rightButtonsOffsetX: 0, rightButtonsOffsetY: 0 };
    const defaults = getDefaultControlPositions(tempSettings);
    setControlPositions({
      move: defaults.move,
      aim: defaults.aim,
      leftButtons: defaults.leftButtons,
      rightButtons: defaults.rightButtons,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      {isEditMode ? (
        <div className="fixed inset-0 bg-background/95 z-50 overflow-hidden" style={{ touchAction: 'none' }}>
          {/* Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>

          <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between gap-2">
            <div className="px-4 py-2 rounded-full border border-primary/40 bg-card/80 backdrop-blur-md font-mono text-xs flex items-center gap-2 text-primary shadow-lg shadow-primary/20">
              <LayoutTemplate className="w-4 h-4" /> Edit UI Layout
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="font-mono text-xs gap-2" onClick={resetToDefaults}>
                 <RefreshCw className="w-3.5 h-3.5" /> Reset
              </Button>
              <Button size="sm" onClick={() => setIsEditMode(false)} className="font-mono text-xs shadow-lg shadow-primary/20">
                Done
              </Button>
            </div>
          </div>

          <div
            className="absolute left-1/2 top-1/2 border-2 border-primary/30 rounded-xl bg-card/20 backdrop-blur-sm transition-all duration-300 pointer-events-none"
            style={{
              width: `${Math.round(60 * (gameFieldScale / 100))}vw`,
              height: `${Math.round(38 * (gameFieldScale / 100))}vh`,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 40px rgba(var(--primary), 0.1) inset'
            }}
          >
            <div className="absolute inset-0 grid place-items-center font-display text-sm text-primary/40 tracking-[0.2em]">GAME FIELD BOUNDARY</div>
          </div>

          {(['leftButtons', 'move', 'rightButtons', 'aim'] as ControlKey[]).map(key => (
            <div
              key={key}
              className="absolute z-20 cursor-move group"
              style={{ left: controlPositions[key].x, top: controlPositions[key].y, transform: 'translate(-50%, -50%)' }}
              onPointerDown={e => startDrag(e, key)}
            >
              {/* Highlight Ring on Hover */}
              <div className="absolute inset-0 rounded-full border border-primary opacity-0 group-hover:opacity-50 group-hover:scale-110 group-active:scale-105 group-active:opacity-100 transition-all duration-200 pointer-events-none" style={{ 
                width: key === 'move' || key === 'aim' ? joystickSize : abilityButtonSize * 2 + 4, 
                height: key === 'move' || key === 'aim' ? joystickSize : abilityButtonSize,
                left: key === 'move' || key === 'aim' ? 0 : 0,
                top: key === 'move' || key === 'aim' ? 0 : 0
              }}></div>

              {key === 'move' || key === 'aim' ? (
                <div className="rounded-full border-2 border-primary/60 bg-card/80 backdrop-blur-md flex flex-col items-center justify-center text-[10px] font-mono shadow-lg shadow-black/50 overflow-hidden relative"
                  style={{ width: joystickSize, height: joystickSize }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                  {key === 'move' ? <Move className="w-6 h-6 text-primary mb-1" /> : <Crosshair className="w-6 h-6 text-primary mb-1" />}
                  <span className="text-muted-foreground">{key.toUpperCase()}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="rounded-full border border-primary/50 bg-card/80 backdrop-blur-md flex flex-col items-center justify-center shadow-lg shadow-black/50 relative overflow-hidden" style={{ width: abilityButtonSize, height: abilityButtonSize }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                    {key === 'leftButtons' ? <Heart className="w-4 h-4 text-rose-500" /> : <Zap className="w-4 h-4 text-yellow-500" />}
                  </div>
                  <div className="rounded-full border border-primary/50 bg-card/80 backdrop-blur-md flex flex-col items-center justify-center shadow-lg shadow-black/50 relative overflow-hidden" style={{ width: abilityButtonSize, height: abilityButtonSize }}>
                     <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                    {key === 'leftButtons' ? <Shield className="w-4 h-4 text-blue-500" /> : <Crosshair className="w-4 h-4 text-emerald-500" />}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-card/60 backdrop-blur-2xl border border-primary/20 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-bold text-primary tracking-widest drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]">SETTINGS</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-white/5">
              <X className="w-5 h-5" />
            </button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-black/40 border border-primary/10 rounded-lg p-1">
              <TabsTrigger value="general" className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-md">General</TabsTrigger>
              <TabsTrigger value="layout" className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-md">Layout & Sizing</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2">
                <label className="font-mono text-xs text-muted-foreground tracking-wider block">USERNAME</label>
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Player"
                  maxLength={12}
                  className="font-mono text-sm h-12 bg-black/40 border-primary/30 focus-visible:ring-primary/50 placeholder:text-muted-foreground/50 transition-all rounded-xl"
                />
              </div>

              <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="font-mono text-sm text-foreground group-hover:text-primary transition-colors">Swap Joysticks</span>
                  <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${swapJoysticks ? 'bg-primary' : 'bg-muted'}`} onClick={() => setSwapJoysticks(!swapJoysticks)}>
                    <div className={`w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform duration-300 shadow-md ${swapJoysticks ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </div>
                </label>
                <p className="text-[10px] text-muted-foreground font-mono">Moves Aim to the Left side and Movement to the Right side.</p>
              </div>

              <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="font-mono text-sm text-foreground group-hover:text-primary transition-colors">Aim Assist</span>
                  <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${aimAssist ? 'bg-primary' : 'bg-muted'}`} onClick={() => setAimAssist(!aimAssist)}>
                    <div className={`w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform duration-300 shadow-md ${aimAssist ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </div>
                </label>
                <p className="text-[10px] text-muted-foreground font-mono">Slightly helps aiming if you are close to a target.</p>
              </div>

               <div className="space-y-2">
                 <label className="font-mono text-xs text-muted-foreground tracking-wider block">GAME FIELD SCALE: {gameFieldScale}%</label>
                  <Slider
                    min={70}
                    max={120}
                    step={1}
                    value={[gameFieldScale]}
                    onValueChange={(val) => setGameFieldScale(val[0])}
                    className="py-2"
                  />
                  <p className="text-[10px] text-muted-foreground font-mono">Adjusts the size of the playable area within standard ranges.</p>
              </div>

              <Button variant="outline" className="w-full font-mono text-xs border-primary/30 hover:bg-primary/10 hover:text-primary transition-all h-10 rounded-xl" onClick={resetToDefaults}>
                <RefreshCw className="mr-2 h-4 w-4" /> RESET TO DEFAULTS
              </Button>
            </TabsContent>

            <TabsContent value="layout" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Button 
                className="w-full font-mono text-sm h-14 rounded-xl bg-gradient-to-r from-primary/80 to-primary hover:from-primary hover:to-primary/80 border border-primary shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all flex items-center justify-center gap-3" 
                onClick={() => setIsEditMode(true)}
              >
                <LayoutTemplate className="w-5 h-5" /> CUSTOMIZE UI LAYOUT
              </Button>

              <div className="space-y-6 p-1">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="font-mono text-xs text-foreground tracking-wider">JOYSTICK SIZE</label>
                    <span className="font-mono text-xs text-primary">{joystickSize}px</span>
                  </div>
                  <Slider
                    min={70}
                    max={170}
                    step={1}
                    value={[joystickSize]}
                    onValueChange={(val) => setJoystickSize(val[0])}
                    className="py-1"
                  />
                </div>

                <div className="space-y-3">
                   <div className="flex justify-between items-center">
                    <label className="font-mono text-xs text-foreground tracking-wider">ABILITY BUTTON SIZE</label>
                    <span className="font-mono text-xs text-primary">{abilityButtonSize}px</span>
                  </div>
                  <Slider
                    min={30}
                    max={64}
                    step={1}
                    value={[abilityButtonSize]}
                    onValueChange={(val) => setAbilityButtonSize(val[0])}
                    className="py-1"
                  />
                </div>
              </div>

              {/* Advanced Offsets Note */}
              <div className="text-center p-3 bg-black/20 rounded-xl border border-white/5 mt-4">
                 <p className="text-[10px] text-muted-foreground font-mono">Use "Customize UI Layout" for precise positioning of controls via drag and drop.</p>
              </div>

            </TabsContent>
          </Tabs>

          <Button onClick={handleSave} className="w-full h-12 font-display tracking-wider mt-6 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all text-base">
            <Save className="w-5 h-5 mr-3" /> SAVE SETTINGS
          </Button>
        </div>
      )}
    </div>
  );
};

export default SettingsModal;
