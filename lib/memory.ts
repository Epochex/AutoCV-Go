import { browser } from 'wxt/browser';
import { resolveCandidate } from './matcher';
import type { FieldDescriptor, FieldMatch, ResumeProfile } from './types';

const STORAGE_KEY = 'autocv.mappingMemory.v1';
const MUTATION_LOCK_NAME = 'autocv.mappingMemory.mutation.v1';
export const MAPPING_MEMORY_CAPACITY = 500;
const UNDO_CAPACITY = 20;
let localMutationTail: Promise<void> = Promise.resolve();

export type MappingMemoryEntry = {
  fingerprint: string;
  site: string;
  profileKey: string;
  confirmations: number;
  createdAt: number;
  updatedAt: number;
};

type MappingMemoryUndo = {
  fingerprint: string;
  previous?: MappingMemoryEntry;
  evicted: MappingMemoryEntry[];
};

export type MappingMemoryState = {
  version: 1;
  entries: MappingMemoryEntry[];
  undo: MappingMemoryUndo[];
};

export type MappingMemoryStorage = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: MappingMemoryState) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type ConfirmedMappingInput = {
  pageUrl: string;
  field: FieldDescriptor;
  profileKey: string;
  explicitConfirmation: boolean;
  fillSucceeded: boolean;
  now?: number;
};

export type MappingMemoryStats = {
  mappings: number;
  confirmations: number;
  sites: number;
  capacity: number;
};

const browserStorage: MappingMemoryStorage = {
  async get(key) {
    const result = await browser.storage.local.get(key);
    return result[key];
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await browser.storage.local.remove(key);
  },
};

function emptyState(): MappingMemoryState {
  return { version: 1, entries: [], undo: [] };
}

function validEntry(value: unknown): value is MappingMemoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<MappingMemoryEntry>;
  return (
    typeof entry.fingerprint === 'string' &&
    typeof entry.site === 'string' &&
    typeof entry.profileKey === 'string' &&
    typeof entry.confirmations === 'number' &&
    Number.isFinite(entry.confirmations) &&
    typeof entry.createdAt === 'number' &&
    Number.isFinite(entry.createdAt) &&
    typeof entry.updatedAt === 'number' &&
    Number.isFinite(entry.updatedAt)
  );
}

function normalizeState(value: unknown): MappingMemoryState {
  if (!value || typeof value !== 'object') return emptyState();
  const raw = value as Partial<MappingMemoryState>;
  if (raw.version !== 1 || !Array.isArray(raw.entries)) return emptyState();
  const entries = raw.entries.filter(validEntry).slice(-MAPPING_MEMORY_CAPACITY);
  const undo = Array.isArray(raw.undo)
    ? raw.undo
        .filter((item): item is MappingMemoryUndo => {
          if (!item || typeof item !== 'object') return false;
          const candidate = item as Partial<MappingMemoryUndo>;
          return (
            typeof candidate.fingerprint === 'string' &&
            (candidate.previous === undefined || validEntry(candidate.previous)) &&
            Array.isArray(candidate.evicted) &&
            candidate.evicted.every(validEntry)
          );
        })
        .slice(-UNDO_CAPACITY)
    : [];
  return { version: 1, entries, undo };
}

async function loadState(storage: MappingMemoryStorage): Promise<MappingMemoryState> {
  return normalizeState(await storage.get(STORAGE_KEY));
}

/**
 * Serializes mutations inside this extension context first, then uses the
 * origin-scoped Web Locks API to coordinate other extension contexts.
 * The local queue remains the fallback in browsers without Web Locks.
 */
export function runExclusiveBrowserMemoryMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (locks) {
      return locks.request(MUTATION_LOCK_NAME, { mode: 'exclusive' }, operation);
    }
    return operation();
  };
  const result = localMutationTail.then(run, run);
  localMutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function mutateBrowserStorage<T>(
  storage: MappingMemoryStorage,
  operation: () => Promise<T>,
): Promise<T> {
  // Injected test stores intentionally remain synchronous with their caller.
  return storage === browserStorage ? runExclusiveBrowserMemoryMutation(operation) : operation();
}

function normalizeFingerprintPart(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Returns only the hostname. Page paths, query strings and fragments are never retained. */
export function siteKeyFromUrl(pageUrl: string): string | undefined {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.hostname.toLowerCase().replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

// Two independent FNV-1a lanes avoid retaining labels while keeping the fingerprint deterministic.
function hashFingerprint(value: string): string {
  const mask = BigInt('0xffffffffffffffff');
  const prime = BigInt('0x100000001b3');
  let first = BigInt('0xcbf29ce484222325');
  let second = BigInt('0x84222325cbf29ce4');
  for (let index = 0; index < value.length; index += 1) {
    const code = BigInt(value.charCodeAt(index));
    first = ((first ^ code) * prime) & mask;
    second = ((second ^ (code + BigInt(index + 1))) * prime) & mask;
  }
  return `${first.toString(16).padStart(16, '0')}${second.toString(16).padStart(16, '0')}`;
}

export function fieldFingerprint(pageUrl: string, field: FieldDescriptor): string | undefined {
  const site = siteKeyFromUrl(pageUrl);
  if (!site) return undefined;
  const parts = [site, field.label, field.name, field.placeholder, field.section, field.type, String(field.occurrence)].map(
    normalizeFingerprintPart,
  );
  // Do not learn a page-wide catch-all mapping from a descriptor with no semantic identity.
  if (parts.slice(1, 5).every((part) => !part)) return undefined;
  return hashFingerprint(parts.join('\u001f'));
}

function isSafeProfileKey(profileKey: string): boolean {
  return profileKey.length > 0 && profileKey.length <= 256 && !/[\r\n\u0000]/.test(profileKey);
}

/**
 * Learns only from a deliberate user confirmation after the content script reports success.
 * The filled value, page URL and field text are deliberately not persisted.
 */
export async function recordConfirmedMapping(
  input: ConfirmedMappingInput,
  storage: MappingMemoryStorage = browserStorage,
): Promise<boolean> {
  const profileKey = input.profileKey.trim();
  if (!input.explicitConfirmation || !input.fillSucceeded || !isSafeProfileKey(profileKey)) return false;
  const site = siteKeyFromUrl(input.pageUrl);
  const fingerprint = fieldFingerprint(input.pageUrl, input.field);
  if (!site || !fingerprint) return false;

  return mutateBrowserStorage(storage, async () => {
    const state = await loadState(storage);
    const existingIndex = state.entries.findIndex((entry) => entry.fingerprint === fingerprint);
    const existing = existingIndex >= 0 ? state.entries[existingIndex] : undefined;
    const previous: MappingMemoryEntry | undefined = existing ? { ...existing } : undefined;
    const now = input.now ?? Date.now();
    const next: MappingMemoryEntry = {
      fingerprint,
      site,
      profileKey,
      confirmations: previous?.profileKey === profileKey ? previous.confirmations + 1 : 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    if (existingIndex >= 0) state.entries.splice(existingIndex, 1);
    state.entries.push(next);
    state.entries.sort((left, right) => left.updatedAt - right.updatedAt);
    const evicted: MappingMemoryEntry[] = [];
    while (state.entries.length > MAPPING_MEMORY_CAPACITY) {
      const evictionIndex = state.entries.findIndex((entry) => entry.fingerprint !== fingerprint);
      if (evictionIndex < 0) break;
      const [entry] = state.entries.splice(evictionIndex, 1);
      if (entry) evicted.push(entry);
    }
    state.undo.push({ fingerprint, previous, evicted });
    state.undo = state.undo.slice(-UNDO_CAPACITY);
    await storage.set(STORAGE_KEY, state);
    return true;
  });
}

export async function undoLastMappingChange(
  storage: MappingMemoryStorage = browserStorage,
): Promise<boolean> {
  return mutateBrowserStorage(storage, async () => {
    const state = await loadState(storage);
    const action = state.undo.pop();
    if (!action) return false;
    state.entries = state.entries.filter((entry) => entry.fingerprint !== action.fingerprint);
    if (action.previous) state.entries.push(action.previous);
    for (const entry of action.evicted) {
      if (!state.entries.some((current) => current.fingerprint === entry.fingerprint)) state.entries.push(entry);
    }
    state.entries = state.entries
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(-MAPPING_MEMORY_CAPACITY);
    await storage.set(STORAGE_KEY, state);
    return true;
  });
}

export async function forgetMapping(
  pageUrl: string,
  field: FieldDescriptor,
  storage: MappingMemoryStorage = browserStorage,
): Promise<boolean> {
  const fingerprint = fieldFingerprint(pageUrl, field);
  if (!fingerprint) return false;
  return mutateBrowserStorage(storage, async () => {
    const state = await loadState(storage);
    const existingIndex = state.entries.findIndex((entry) => entry.fingerprint === fingerprint);
    if (existingIndex < 0) return false;
    const [previous] = state.entries.splice(existingIndex, 1);
    state.undo.push({ fingerprint, previous, evicted: [] });
    state.undo = state.undo.slice(-UNDO_CAPACITY);
    await storage.set(STORAGE_KEY, state);
    return true;
  });
}

export async function clearMappingMemory(storage: MappingMemoryStorage = browserStorage): Promise<void> {
  // Clearing also removes undo history so deleted mappings cannot be recovered from browser storage.
  await mutateBrowserStorage(storage, () => storage.remove(STORAGE_KEY));
}

export async function getMappingMemoryStats(
  storage: MappingMemoryStorage = browserStorage,
): Promise<MappingMemoryStats> {
  const state = await loadState(storage);
  return {
    mappings: state.entries.length,
    confirmations: state.entries.reduce((sum, entry) => sum + entry.confirmations, 0),
    sites: new Set(state.entries.map((entry) => entry.site)).size,
    capacity: MAPPING_MEMORY_CAPACITY,
  };
}

/** Returns remembered matches only when the referenced profile item still exists and has a value. */
export async function matchFieldsFromMemory(
  fields: FieldDescriptor[],
  profile: ResumeProfile,
  pageUrl: string,
  storage: MappingMemoryStorage = browserStorage,
): Promise<FieldMatch[]> {
  const state = await loadState(storage);
  const byFingerprint = new Map(state.entries.map((entry) => [entry.fingerprint, entry]));
  const matches: FieldMatch[] = [];
  for (const field of fields) {
    if (field.currentValue) continue;
    const fingerprint = fieldFingerprint(pageUrl, field);
    const remembered = fingerprint ? byFingerprint.get(fingerprint) : undefined;
    if (!remembered) continue;
    const candidate = resolveCandidate(profile, remembered.profileKey);
    if (!candidate?.value.trim()) continue;
    matches.push({
      fieldId: field.id,
      profileKey: candidate.key,
      fieldLabel: field.label || field.placeholder || field.name || '未命名字段',
      profileLabel: candidate.label,
      value: candidate.value,
      confidence: 100,
      source: 'memory',
      reason: `你已在此网站确认过 ${remembered.confirmations} 次`,
    });
  }
  return matches;
}
