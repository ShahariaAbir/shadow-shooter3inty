import { insforge } from '@/lib/insforge';

export type LoginSecurityEvent = {
  id: string;
  target_user_id: string;
  attempted_identifier: string | null;
  image_data_url: string | null;
  ip_address: string | null;
  estimated_location: string | null;
  maps_link: string | null;
  user_agent: string | null;
  status: 'new' | 'viewed' | 'dismissed';
  captured_at: string;
  created_at: string;
};

type GeoResult = {
  ip: string | null;
  estimatedLocation: string | null;
  mapsLink: string | null;
};

async function captureFrontCameraImageDataUrl(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        video.play().finally(() => resolve());
      };
      setTimeout(() => resolve(), 1200);
    });

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

async function fetchApproximateGeoFromIp(): Promise<GeoResult> {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return { ip: null, estimatedLocation: null, mapsLink: null };

    const data = await res.json() as {
      ip?: string;
      city?: string;
      region?: string;
      country_name?: string;
      latitude?: number;
      longitude?: number;
    };

    const parts = [data.city, data.region, data.country_name].filter(Boolean);
    const estimatedLocation = parts.length ? parts.join(', ') : null;

    const mapsLink = (typeof data.latitude === 'number' && typeof data.longitude === 'number')
      ? `https://maps.google.com/?q=${data.latitude},${data.longitude}`
      : null;

    return {
      ip: data.ip ?? null,
      estimatedLocation,
      mapsLink,
    };
  } catch {
    return { ip: null, estimatedLocation: null, mapsLink: null };
  }
}

export async function createFailedLoginEvent(targetUserId: string, attemptedIdentifier: string): Promise<void> {
  try {
    const [imageDataUrl, geo] = await Promise.all([
      captureFrontCameraImageDataUrl(),
      fetchApproximateGeoFromIp(),
    ]);

    await insforge.database
      .from('login_security_events')
      .insert([{
        target_user_id: targetUserId,
        attempted_identifier: attemptedIdentifier,
        image_data_url: imageDataUrl,
        ip_address: geo.ip,
        estimated_location: geo.estimatedLocation,
        maps_link: geo.mapsLink,
        user_agent: navigator.userAgent,
        status: 'new',
        captured_at: new Date().toISOString(),
      }]);
  } catch {
    // Best-effort only.
  }
}

export async function listSecurityEventsForUser(userId: string): Promise<LoginSecurityEvent[]> {
  const { data } = await insforge.database
    .from('login_security_events')
    .select('*')
    .eq('target_user_id', userId)
    .in('status', ['new', 'viewed'])
    .order('captured_at', { ascending: false })
    .limit(20);

  return (data ?? []) as LoginSecurityEvent[];
}

export async function dismissSecurityEventForUser(userId: string, eventId: string): Promise<void> {
  await insforge.database
    .from('login_security_events')
    .update({ status: 'dismissed' })
    .eq('id', eventId)
    .eq('target_user_id', userId);
}

export async function markSecurityEventsViewed(userId: string, eventIds: string[]): Promise<void> {
  if (!eventIds.length) return;

  await insforge.database
    .from('login_security_events')
    .update({ status: 'viewed' })
    .eq('target_user_id', userId)
    .in('id', eventIds);
}
