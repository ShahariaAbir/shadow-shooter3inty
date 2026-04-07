const MT_BASE = 'https://guojtupdyuvkqxeqntzw.supabase.co/rest/v1';
const MT_API_KEY = 'sb_publishable_xaHspnU-Al7TEu0qtVhMrA_DFTVQQV9';
export const SHADOW_SHOOTER_RECEIVER_ID = 'shadowshooter';

type MoneyUser = { id: string; username: string; balance: number };

const headers = {
  apikey: MT_API_KEY,
  Authorization: `Bearer ${MT_API_KEY}`,
  'Content-Type': 'application/json',
};

export async function fetchMoneyUserProfile(userId: string, expectedUsername?: string): Promise<{ ok: boolean; user?: MoneyUser; reason?: string }> {
  const res = await fetch(`${MT_BASE}/users?id=eq.${encodeURIComponent(userId)}&select=id,username,balance`, { headers });
  if (!res.ok) return { ok: false, reason: 'Unable to fetch money app profile.' };
  const rows = await res.json() as MoneyUser[];
  if (!rows?.length) return { ok: false, reason: 'Money app account not found.' };
  const user = rows[0];
  if (expectedUsername && user.username.toLowerCase() !== expectedUsername.trim().toLowerCase()) {
    return { ok: false, reason: 'Money app username does not match this user ID.' };
  }
  return { ok: true, user };
}

export async function transferToShadowShooter(senderId: string, amount: number): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`${MT_BASE}/rpc/transfer_money`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_sender_id: senderId,
      p_receiver_id: SHADOW_SHOOTER_RECEIVER_ID,
      p_amount: amount,
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    return { ok: false, reason: details || 'Money transfer failed.' };
  }

  return { ok: true };
}
