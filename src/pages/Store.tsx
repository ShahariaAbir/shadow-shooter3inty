import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Bomb, Link2, Wallet, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchMoneyUserProfile, transferToShadowShooter } from '@/lib/moneyTransfer';
import { ECONOMY_CONFIG } from '@/lib/economy';

const MONEY_CACHE_KEY = 'shadow-shooter:money-app-profile';

const COIN_PACKS = [100, 250, 500];

export default function Store() {
  const navigate = useNavigate();
  const { user, stats, refreshStats, buyGrenadePack, buyCoins } = useAuth();
  const [moneyId, setMoneyId] = useState('');
  const [moneyUsername, setMoneyUsername] = useState('');
  const [moneyBalance, setMoneyBalance] = useState<number | null>(null);
  const [moneyConnected, setMoneyConnected] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const cachedRaw = localStorage.getItem(MONEY_CACHE_KEY);
    if (!cachedRaw) return;
    try {
      const cached = JSON.parse(cachedRaw) as { id: string; username: string };
      setMoneyId(cached.id || '');
      setMoneyUsername(cached.username || '');
    } catch {
      localStorage.removeItem(MONEY_CACHE_KEY);
    }
  }, []);

  const canUseStore = useMemo(() => !!user, [user]);

  const connectMoneyApp = async () => {
    if (!moneyId.trim() || !moneyUsername.trim()) {
      setMsg('Enter both money app user ID and username.');
      return;
    }
    setBusy(true);
    setMsg('');
    const profile = await fetchMoneyUserProfile(moneyId.trim(), moneyUsername.trim());
    if (!profile.ok || !profile.user) {
      setMoneyConnected(false);
      setMsg(profile.reason || 'Unable to connect account.');
      setBusy(false);
      return;
    }

    localStorage.setItem(MONEY_CACHE_KEY, JSON.stringify({ id: profile.user.id, username: profile.user.username }));
    setMoneyId(profile.user.id);
    setMoneyUsername(profile.user.username);
    setMoneyBalance(Number(profile.user.balance || 0));
    setMoneyConnected(true);
    setMsg('Account connected successfully.');
    setBusy(false);
  };

  const refreshMoneyBalance = async () => {
    if (!moneyId) return;
    const profile = await fetchMoneyUserProfile(moneyId, moneyUsername);
    if (profile.ok && profile.user) {
      setMoneyBalance(Number(profile.user.balance || 0));
    }
  };

  const handleBuyGrenade = async () => {
    setBusy(true);
    const result = await buyGrenadePack();
    setMsg(result.ok ? 'Grenade purchased.' : (result.reason || 'Purchase failed.'));
    await refreshStats();
    setBusy(false);
  };

  const handleBuyCoinPack = async (amount: number) => {
    if (!moneyConnected) {
      setMsg('Connect and verify your money app profile first.');
      return;
    }

    setBusy(true);
    setMsg('');
    const profile = await fetchMoneyUserProfile(moneyId.trim(), moneyUsername.trim());
    if (!profile.ok || !profile.user) {
      setMoneyConnected(false);
      setMoneyBalance(null);
      setMsg(profile.reason || 'Account verification failed.');
      setBusy(false);
      return;
    }

    const transfer = await transferToShadowShooter(moneyId, amount);
    if (!transfer.ok) {
      setMsg(transfer.reason || 'Money transfer failed.');
      setBusy(false);
      return;
    }

    const coinResult = await buyCoins(amount);
    if (!coinResult.ok) {
      setMsg(coinResult.reason || 'Could not credit coins. Contact support.');
      setBusy(false);
      return;
    }

    await Promise.all([refreshStats(), refreshMoneyBalance()]);
    setMsg(`Purchased ${amount} coins.`);
    setBusy(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <button onClick={() => navigate('/')} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h1 className="text-xl font-bold">Store</h1>
          <p className="text-xs text-muted-foreground">Coins: {stats?.coins ?? 0} • Grenades: {stats?.grenades_owned ?? 0}</p>
        </div>

        {!canUseStore && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-200">
            Please sign in to use the store.
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="w-4 h-4" /> Connect Money Transfer App</div>
          <input
            value={moneyId}
            onChange={(e) => {
              setMoneyId(e.target.value);
              setMoneyConnected(false);
            }}
            placeholder="Money app user id"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={moneyUsername}
            onChange={(e) => {
              setMoneyUsername(e.target.value);
              setMoneyConnected(false);
            }}
            placeholder="Money app username"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
          />
          <button disabled={busy || !canUseStore} onClick={connectMoneyApp} className="w-full h-10 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Connect'}
          </button>
          <p className="text-xs text-muted-foreground">Connected: {moneyConnected ? (moneyUsername || 'connected') : 'not connected'} {moneyBalance !== null && moneyConnected ? `• Balance: ${moneyBalance}` : ''}</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Bomb className="w-4 h-4" /> Grenades</div>
          <p className="text-xs text-muted-foreground">{ECONOMY_CONFIG.grenadePriceCoins} coins per grenade.</p>
          <button disabled={busy || !canUseStore} onClick={handleBuyGrenade} className="w-full h-10 rounded-lg border border-red-400/40 bg-red-500/20 text-red-300 text-sm font-semibold">
            Buy Grenade
          </button>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Wallet className="w-4 h-4" /> Buy Coins via Money Transfer</div>
          <div className="grid grid-cols-3 gap-2">
            {COIN_PACKS.map(pack => (
              <button key={pack} disabled={busy || !canUseStore || !moneyConnected} onClick={() => handleBuyCoinPack(pack)} className="h-10 rounded-lg border border-yellow-400/40 bg-yellow-500/15 text-yellow-200 text-xs font-semibold flex items-center justify-center gap-1">
                <Coins className="w-3.5 h-3.5" /> {pack}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Transfer receiver: <span className="font-mono">shadowshooter</span>.</p>
        </div>

        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}
