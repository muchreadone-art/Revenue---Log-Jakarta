import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { CustomerOrderMap, DataQualityRow } from '../data/initialLogisticsData';
import { INITIAL_VLI_DATA, INITIAL_VLI_DQ } from '../data/initialLogisticsData';
import type { SourceKey, SourceMeta, SourceState } from '../types/logistics';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string })?.code;
  const msg = String((error as { message?: string })?.message || error).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('free daily read units') ||
    msg.includes('quota')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errStr = error instanceof Error ? error.message : String(error);
  if (isFirestoreQuotaError(error)) {
    console.warn(`[Firestore] Daily quota limit reached during ${operationType} on ${path}. Operating in local cache & server mode.`);
    throw new Error('QUOTA_LIMIT_EXCEEDED');
  }

  const errInfo: FirestoreErrorInfo = {
    error: errStr,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const DEFAULT_LOGISTICS_SOURCES: Record<SourceKey, SourceState> = {
  TRP: {
    key: 'TRP',
    label: 'Master Data - TRP',
    data: null,
    dq: null,
    meta: null,
    isDefault: true,
  },
  VLI: {
    key: 'VLI',
    label: 'Master Data - VLI',
    data: INITIAL_VLI_DATA,
    dq: INITIAL_VLI_DQ,
    meta: {
      file: 'Data awal (bawaan dashboard)',
      at: '',
      prod: 'VLI',
    },
    isDefault: true,
  },
};

const MAX_CHUNK_JSON_CHARS = 350_000;

function splitIntoChunks(data: CustomerOrderMap | null): Array<{ index: number; customerCount: number; jsonData: string }> {
  if (!data) return [];
  const entries = Object.entries(data);
  const chunks: Array<{ index: number; customerCount: number; jsonData: string }> = [];

  let currentMap: CustomerOrderMap = {};
  let currentSize = 2; // '{}'
  let currentCustomers = 0;

  const flushCurrent = () => {
    if (currentCustomers > 0) {
      chunks.push({
        index: chunks.length,
        customerCount: currentCustomers,
        jsonData: JSON.stringify(currentMap),
      });
      currentMap = {};
      currentSize = 2;
      currentCustomers = 0;
    }
  };

  for (const [cust, orders] of entries) {
    const custJson = JSON.stringify({ [cust]: orders });
    if (custJson.length <= MAX_CHUNK_JSON_CHARS) {
      if (currentCustomers > 0 && currentSize + custJson.length > MAX_CHUNK_JSON_CHARS) {
        flushCurrent();
      }
      currentMap[cust] = orders;
      currentSize += custJson.length;
      currentCustomers += 1;
    } else {
      // Single customer has very large order array: split orders across chunks
      flushCurrent();
      let orderSlice: CustomerOrderMap[string] = [];
      let sliceSize = JSON.stringify({ [cust]: [] }).length;
      for (const order of orders) {
        const orderStrLen = JSON.stringify(order).length + 1;
        if (orderSlice.length > 0 && sliceSize + orderStrLen > MAX_CHUNK_JSON_CHARS) {
          chunks.push({
            index: chunks.length,
            customerCount: 1,
            jsonData: JSON.stringify({ [cust]: orderSlice }),
          });
          orderSlice = [];
          sliceSize = JSON.stringify({ [cust]: [] }).length;
        }
        orderSlice.push(order);
        sliceSize += orderStrLen;
      }
      if (orderSlice.length > 0) {
        chunks.push({
          index: chunks.length,
          customerCount: 1,
          jsonData: JSON.stringify({ [cust]: orderSlice }),
        });
      }
    }
  }

  flushCurrent();
  return chunks;
}

export async function saveSourceToFirestore(
  key: SourceKey,
  state: SourceState
): Promise<void> {
  const sourcePath = `logistics_sources/${key}`;
  const chunksPath = `${sourcePath}/chunks`;

  try {
    const chunks = splitIntoChunks(state.data);

    // Commit chunk documents in batches (<= 5 chunks per batch to stay well below Firestore 10MB batch limit)
    const BATCH_CHUNKS = 5;
    for (let i = 0; i < chunks.length; i += BATCH_CHUNKS) {
      const batch = writeBatch(db);
      const slice = chunks.slice(i, i + BATCH_CHUNKS);
      for (const chunk of slice) {
        const chunkDocRef = doc(db, 'logistics_sources', key, 'chunks', `chunk_${chunk.index}`);
        batch.set(chunkDocRef, {
          chunkIndex: chunk.index,
          customerCount: chunk.customerCount,
          jsonData: chunk.jsonData,
        });
      }
      await batch.commit();
    }

    // Sanitize meta and serialize dq (DataQualityRow[] is an array of arrays, which Firestore forbids)
    const sanitizedMeta = state.meta ? JSON.parse(JSON.stringify(state.meta)) : null;
    const dqJson = state.dq ? JSON.stringify(state.dq) : null;

    // Write parent source document last so listeners only read chunks after they exist
    const parentDocRef = doc(db, 'logistics_sources', key);
    await setDoc(parentDocRef, {
      key: state.key,
      label: state.label,
      isDefault: Boolean(state.isDefault),
      chunkCount: chunks.length,
      updatedAt: new Date().toISOString(),
      meta: sanitizedMeta,
      dqJson,
    });

    console.log(`[Firestore] Successfully saved source ${key} with ${chunks.length} chunks`);
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      console.warn(`[Firestore] Daily quota reached while saving ${key}. Operating in local cache & server mode.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, chunksPath);
  }
}

export async function resetSourceInFirestore(key: SourceKey): Promise<void> {
  try {
    const defaultState = DEFAULT_LOGISTICS_SOURCES[key];
    await saveSourceToFirestore(key, defaultState);
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      console.warn(`[Firestore] Daily quota reached while resetting ${key}. Operating in local cache & server mode.`);
      return;
    }
    throw error;
  }
}

export async function fetchSourceChunksFromFirestore(
  key: SourceKey,
  chunkCount: number
): Promise<CustomerOrderMap | null> {
  if (chunkCount <= 0) return null;
  const path = `logistics_sources/${key}/chunks`;

  try {
    const promises = [];
    for (let i = 0; i < chunkCount; i++) {
      promises.push(getDoc(doc(db, 'logistics_sources', key, 'chunks', `chunk_${i}`)));
    }
    const docs = await Promise.all(promises);
    const combinedData: CustomerOrderMap = {};

    docs.forEach((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.jsonData) {
          try {
            const parsed = JSON.parse(data.jsonData) as CustomerOrderMap;
            for (const [cust, orders] of Object.entries(parsed)) {
              if (!combinedData[cust]) {
                combinedData[cust] = orders;
              } else {
                combinedData[cust] = [...combinedData[cust], ...orders];
              }
            }
          } catch (e) {
            console.warn(`[Firestore] Failed to parse chunk ${docSnap.id}:`, e);
          }
        }
      }
    });

    return Object.keys(combinedData).length > 0 ? combinedData : null;
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      console.warn(`[Firestore] Daily quota reached while fetching chunks for ${key}. Falling back to cached data.`);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

function parseDqField(raw: Record<string, unknown>): DataQualityRow[] | null {
  if (typeof raw.dqJson === 'string' && raw.dqJson.length > 0) {
    try {
      return JSON.parse(raw.dqJson) as DataQualityRow[];
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw.dq)) {
    return raw.dq as DataQualityRow[];
  }
  return null;
}

export function subscribeToFirestoreSources(
  onSourceUpdate: (key: SourceKey, state: SourceState) => void
): () => void {
  let vliReqId = 0;
  let trpReqId = 0;
  let unsubVli: (() => void) | null = null;
  let unsubTrp: (() => void) | null = null;

  try {
    unsubVli = onSnapshot(
      doc(db, 'logistics_sources', 'VLI'),
      async (docSnap) => {
        const reqId = ++vliReqId;
        try {
          if (docSnap.exists()) {
            const raw = docSnap.data();
            const chunkCount = raw.chunkCount ?? 0;
            const data = await fetchSourceChunksFromFirestore('VLI', chunkCount);
            if (reqId !== vliReqId) return;
            const parsedDq = parseDqField(raw);
            const vliState: SourceState = {
              key: 'VLI',
              label: raw.label || 'Master Data - VLI',
              data: data || (raw.isDefault ? INITIAL_VLI_DATA : null),
              dq: parsedDq || (raw.isDefault ? INITIAL_VLI_DQ : null),
              meta: (raw.meta as SourceMeta) || null,
              isDefault: Boolean(raw.isDefault),
            };
            onSourceUpdate('VLI', vliState);
          } else {
            saveSourceToFirestore('VLI', DEFAULT_LOGISTICS_SOURCES.VLI).catch(() => {});
          }
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            console.warn('[Firestore] VLI snapshot processing paused: daily quota limit reached.');
            if (unsubVli) {
              try { unsubVli(); } catch {}
              unsubVli = null;
            }
          } else {
            console.warn('[Firestore] Notice during VLI snapshot processing:', err);
          }
        }
      },
      (error) => {
        if (isFirestoreQuotaError(error)) {
          console.warn('[Firestore] VLI listener paused: daily quota limit reached. Using offline local storage & server sync.');
          if (unsubVli) {
            try { unsubVli(); } catch {}
            unsubVli = null;
          }
          return;
        }
        console.warn('[Firestore] VLI snapshot listener notice:', error?.message || error);
      }
    );
  } catch (err) {
    console.warn('[Firestore] VLI listener setup notice:', err);
  }

  try {
    unsubTrp = onSnapshot(
      doc(db, 'logistics_sources', 'TRP'),
      async (docSnap) => {
        const reqId = ++trpReqId;
        try {
          if (docSnap.exists()) {
            const raw = docSnap.data();
            const chunkCount = raw.chunkCount ?? 0;
            const data = await fetchSourceChunksFromFirestore('TRP', chunkCount);
            if (reqId !== trpReqId) return;
            const trpState: SourceState = {
              key: 'TRP',
              label: raw.label || 'Master Data - TRP',
              data,
              dq: parseDqField(raw),
              meta: (raw.meta as SourceMeta) || null,
              isDefault: Boolean(raw.isDefault),
            };
            onSourceUpdate('TRP', trpState);
          }
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            console.warn('[Firestore] TRP snapshot processing paused: daily quota limit reached.');
            if (unsubTrp) {
              try { unsubTrp(); } catch {}
              unsubTrp = null;
            }
          } else {
            console.warn('[Firestore] Notice during TRP snapshot processing:', err);
          }
        }
      },
      (error) => {
        if (isFirestoreQuotaError(error)) {
          console.warn('[Firestore] TRP listener paused: daily quota limit reached. Using offline local storage & server sync.');
          if (unsubTrp) {
            try { unsubTrp(); } catch {}
            unsubTrp = null;
          }
          return;
        }
        console.warn('[Firestore] TRP snapshot listener notice:', error?.message || error);
      }
    );
  } catch (err) {
    console.warn('[Firestore] TRP listener setup notice:', err);
  }

  return () => {
    if (unsubVli) {
      try { unsubVli(); } catch {}
    }
    if (unsubTrp) {
      try { unsubTrp(); } catch {}
    }
  };
}
