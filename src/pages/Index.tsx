import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Dashboard from '@/components/Dashboard';
import MatchmakingScreen from '@/components/MatchmakingScreen';

const Index = () => {
  const navigate = useNavigate();
  const { user, stats, hasPendingMatchmakingPenalty, loading, signInWithGoogle, signOut, updateName, refreshStats, applyMatchmakingPenalty } = useAuth();
  const [showScanner, setShowScanner] = useState(false);
  const [showMatchmaking, setShowMatchmaking] = useState(false);
  const [matchDetails, setMatchDetails] = useState<{mode: string, size: string} | null>(null);
  const [signingIn, setSigningIn] = useState(false);
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
        const el = document.getElementById('home-qr-reader');
        if (!el) return;
        const { Html5Qrcode } = await import('html5-qrcode');
        scanner = new Html5Qrcode('home-qr-reader');
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
              setTimeout(() => navigate(`/game?room=${match[1].toUpperCase()}`), 100);
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
  }, [showScanner, navigate]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    await signInWithGoogle();
    setSigningIn(false);
  };

  const handleMatchFound = useCallback(() => {
    if (matchDetails) {
      navigate(`/game?mode=matchmaking&gameMode=${matchDetails.mode}&teamSize=${matchDetails.size}`);
    }
  }, [navigate, matchDetails]);

  const handleOfflinePlay = useCallback(() => {
    navigate('/game');
  }, [navigate]);

  useEffect(() => {
    if (!user || loading) return;
    refreshStats();

    const onVisibleOrFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshStats();
      }
    };

    window.addEventListener('focus', onVisibleOrFocus);
    document.addEventListener('visibilitychange', onVisibleOrFocus);

    return () => {
      window.removeEventListener('focus', onVisibleOrFocus);
      document.removeEventListener('visibilitychange', onVisibleOrFocus);
    };
  }, [user, loading, refreshStats]);

  if (showMatchmaking) {
    return <MatchmakingScreen onMatchFound={handleMatchFound} />;
  }

  return (
    <div className="flex flex-col items-center justify-center bg-background p-6" style={{ height: '100dvh' }}>
      <div className="text-center w-full max-w-xs space-y-5">
        <img src="/icon-512.png" alt="Shadow Shooter" className="w-20 h-20 mx-auto rounded-2xl shadow-lg shadow-primary/30" />
        <div className="space-y-0.5">
          <h1 className="text-3xl font-display font-black tracking-wider text-primary drop-shadow-[0_0_20px_hsl(150,100%,42%,0.3)]">
            SHADOW
          </h1>
          <h1 className="text-3xl font-display font-black tracking-wider text-foreground">
            SHOOTER
          </h1>
        </div>
        <p className="text-muted-foreground font-mono text-[10px] tracking-wider">
          Mobile Arena Shooter • P2P Multiplayer
        </p>

        {showScanner && (
          <div className="w-full max-w-[320px] mx-auto">
            <div id="home-qr-reader" className="rounded-lg overflow-hidden bg-black/50" style={{ width: '100%', minHeight: 300 }} />
            <Button variant="ghost" size="sm" onClick={() => {
              setShowScanner(false);
              if (scannerReadyRef.current) scannerRef.current?.stop?.().catch(() => { });
              scannerReadyRef.current = false;
            }} className="w-full mt-1 font-mono text-[10px] h-7">
              <X className="w-3 h-3 mr-1" /> CLOSE
            </Button>
          </div>
        )}

        {!showScanner && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : user ? (
              /* Logged-in dashboard */
              <Dashboard
                user={user}
                stats={stats}
                hasPendingMatchmakingPenalty={hasPendingMatchmakingPenalty}
                onSignOut={signOut}
                onMatchMake={(mode, size) => {
                  applyMatchmakingPenalty();
                  setMatchDetails({ mode, size });
                  setShowMatchmaking(true);
                }}
                onOfflinePlay={handleOfflinePlay}
                onEditName={updateName}
              />
            ) : (
              /* Guest mode */
              <div className="flex flex-col gap-2.5">
                {/* Google Sign-In */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="h-12 w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-3 transition-all active:scale-95 border border-white/15 bg-white/5 hover:bg-white/10 text-foreground"
                >
                  {signingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                      <g fill="none" fillRule="evenodd">
                        <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4" />
                        <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5836-5.036-3.7109H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
                        <path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9574C.3477 6.1732 0 7.5482 0 9s.3477 2.8268.9574 4.0418L3.964 10.71z" fill="#FBBC05" />
                        <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z" fill="#EA4335" />
                      </g>
                    </svg>
                  )}
                  Continue with Google
                </button>

                {/* Offline Play */}
                <Button onClick={() => navigate('/game')} className="h-12 text-base font-display tracking-[0.3em]" size="lg">
                  PLAY OFFLINE
                </Button>

                <p className="text-muted-foreground/50 font-mono text-[9px]">
                  Sign in to track K/D, level & ranked matches
                </p>

                {!showScanner && (
                  <Button onClick={() => setShowScanner(true)} variant="outline" className="h-10 font-display tracking-wider text-xs">
                    <Camera className="w-4 h-4 mr-2" /> SCAN QR TO JOIN
                  </Button>
                )}
              </div>
            )}

            {user && !showScanner && (
              <Button onClick={() => setShowScanner(true)} variant="outline" className="h-10 font-display tracking-wider text-xs w-full">
                <Camera className="w-4 h-4 mr-2" /> SCAN QR TO JOIN
              </Button>
            )}
          </>
        )}

        <p className="text-muted-foreground/40 font-mono text-[9px] max-w-xs mx-auto">
          Create rooms on same WiFi • Solo mode works offline
        </p>
      </div>
    </div>
  );
};

export default Index;
