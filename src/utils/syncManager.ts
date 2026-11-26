import type { SourceKey, SourceState } from '../types/logistics';

const CACHE_KEY = 'logiflow_sources_cache_v1';
const CHANNEL_NAME = 'logiflow_sync_channel';

export interface SyncPayload {
  sources: Record<SourceKey, SourceState>;
  updatedAt: number;
}

export function saveLocalCache(sources: Record<SourceKey, SourceState>, updatedAt: number): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        sources,
        updatedAt,
      })
    );
  } catch {
    // quota exceeded or private mode, fallback gracefully
  }
}

export function loadLocalCache(): SyncPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.sources) {
      return parsed as SyncPayload;
    }
  } catch {
    // ignore corrupted cache
  }
  return null;
}

export function broadcastSources(sources: Record<SourceKey, SourceState>, updatedAt: number): void {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({
        type: 'SOURCES_UPDATED',
        sources,
        updatedAt,
      });
      bc.close();
    } catch {
      // ignore
    }
  }
}

export function subscribeToBroadcast(
  onUpdate: (payload: SyncPayload) => void
): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {};
  }
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SOURCES_UPDATED' && event.data.sources) {
        onUpdate({
          sources: event.data.sources,
          updatedAt: event.data.updatedAt || Date.now(),
        });
      }
    };
    bc.addEventListener('message', handler);
    return () => {
      bc.removeEventListener('message', handler);
      bc.close();
    };
  } catch {
    return () => {};
  }
}

export async function fetchServerSources(): Promise<SyncPayload | null> {
  try {
    const res = await fetch('/api/sources', {
      headers: { credentials: 'same-origin' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.sources) {
      return {
        sources: data.sources,
        updatedAt: data.updatedAt || Date.now(),
      };
    }
  } catch {
    // network or dev server starting
  }
  return null;
}

export async function pushServerSource(
  key: SourceKey,
  sourceState: Partial<SourceState>
): Promise<SyncPayload | null> {
  try {
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, sourceState }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.sources) {
      return {
        sources: data.sources,
        updatedAt: data.updatedAt || Date.now(),
      };
    }
  } catch {
    // network failure
  }
  return null;
}

export async function resetServerSource(key: SourceKey): Promise<SyncPayload | null> {
  try {
    const res = await fetch('/api/sources/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.sources) {
      return {
        sources: data.sources,
        updatedAt: data.updatedAt || Date.now(),
      };
    }
  } catch {
    // network failure
  }
  return null;
}
