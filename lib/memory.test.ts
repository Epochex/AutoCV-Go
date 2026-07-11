import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from './defaults';
import {
  MAPPING_MEMORY_CAPACITY,
  clearMappingMemory,
  fieldFingerprint,
  forgetMapping,
  getMappingMemoryStats,
  matchFieldsFromMemory,
  recordConfirmedMapping,
  runExclusiveBrowserMemoryMutation,
  siteKeyFromUrl,
  undoLastMappingChange,
  type MappingMemoryState,
  type MappingMemoryStorage,
} from './memory';
import type { FieldDescriptor, ResumeProfile } from './types';

function memoryStorage(): MappingMemoryStorage & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, structuredClone(value));
    },
    async remove(key) {
      values.delete(key);
    },
  };
}

function field(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id: 'field-1',
    tag: 'input',
    type: 'text',
    label: '姓名',
    name: 'candidateName',
    placeholder: '请输入姓名',
    section: '基本信息',
    options: [],
    currentValue: '',
    occurrence: 0,
    required: false,
    fillCapability: 'auto',
    manualReason: '',
    ...overrides,
  };
}

function profile(): ResumeProfile {
  const value = structuredClone(DEFAULT_PROFILE);
  value.basics.fullName = '林同学';
  value.basics.email = 'candidate@example.com';
  return value;
}

describe('mapping memory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses only the hostname and normalized descriptor metadata for stable fingerprints', () => {
    const first = fieldFingerprint('https://www.jobs.example/apply?id=secret#step', field());
    const second = fieldFingerprint(
      'https://jobs.example/another-private-path',
      field({ label: ' 姓名 ', section: '基本信息' }),
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(siteKeyFromUrl('file:///resume.html')).toBeUndefined();
    expect(fieldFingerprint('https://jobs.example/apply', field({ occurrence: 1 }))).not.toBe(first);
  });

  it('refuses to learn without both explicit confirmation and successful fill', async () => {
    const storage = memoryStorage();
    const base = {
      pageUrl: 'https://jobs.example/apply',
      field: field(),
      profileKey: 'basics.fullName',
    };
    expect(
      await recordConfirmedMapping(
        { ...base, explicitConfirmation: false, fillSucceeded: true },
        storage,
      ),
    ).toBe(false);
    expect(
      await recordConfirmedMapping(
        { ...base, explicitConfirmation: true, fillSucceeded: false },
        storage,
      ),
    ).toBe(false);
    expect((await getMappingMemoryStats(storage)).mappings).toBe(0);
  });

  it('persists confirmations and resolves a remembered profile key to a FieldMatch', async () => {
    const storage = memoryStorage();
    const input = {
      pageUrl: 'https://jobs.example/apply/42',
      field: field(),
      profileKey: 'basics.fullName',
      explicitConfirmation: true,
      fillSucceeded: true,
      now: 10,
    };
    await recordConfirmedMapping(input, storage);
    await recordConfirmedMapping({ ...input, now: 20 }, storage);

    const matches = await matchFieldsFromMemory([field()], profile(), input.pageUrl, storage);
    expect(matches).toEqual([
      expect.objectContaining({
        fieldId: 'field-1',
        profileKey: 'basics.fullName',
        value: '林同学',
        source: 'memory',
        confidence: 100,
      }),
    ]);
    expect(matches[0]!.reason).toContain('2 次');
    expect(await getMappingMemoryStats(storage)).toEqual({
      mappings: 1,
      confirmations: 2,
      sites: 1,
      capacity: MAPPING_MEMORY_CAPACITY,
    });
  });

  it('does not return stale profile keys or cross-site matches', async () => {
    const storage = memoryStorage();
    await recordConfirmedMapping(
      {
        pageUrl: 'https://a.example/apply',
        field: field(),
        profileKey: 'basics.fullName',
        explicitConfirmation: true,
        fillSucceeded: true,
      },
      storage,
    );
    const staleProfile = profile();
    staleProfile.basics.fullName = '';
    expect(await matchFieldsFromMemory([field()], staleProfile, 'https://a.example/apply', storage)).toEqual([]);
    expect(await matchFieldsFromMemory([field()], profile(), 'https://b.example/apply', storage)).toEqual([]);
  });

  it('supports undoing updates and explicit forget operations', async () => {
    const storage = memoryStorage();
    const base = {
      pageUrl: 'https://jobs.example/apply',
      field: field(),
      explicitConfirmation: true,
      fillSucceeded: true,
    };
    await recordConfirmedMapping({ ...base, profileKey: 'basics.fullName' }, storage);
    await recordConfirmedMapping({ ...base, profileKey: 'basics.email' }, storage);
    expect((await matchFieldsFromMemory([field()], profile(), base.pageUrl, storage))[0]!.profileKey).toBe(
      'basics.email',
    );
    expect(await undoLastMappingChange(storage)).toBe(true);
    expect((await matchFieldsFromMemory([field()], profile(), base.pageUrl, storage))[0]!.profileKey).toBe(
      'basics.fullName',
    );
    expect(await forgetMapping(base.pageUrl, field(), storage)).toBe(true);
    expect(await matchFieldsFromMemory([field()], profile(), base.pageUrl, storage)).toEqual([]);
    expect(await undoLastMappingChange(storage)).toBe(true);
    expect((await getMappingMemoryStats(storage)).mappings).toBe(1);
  });

  it('bounds memory and removes data plus undo history when cleared', async () => {
    const storage = memoryStorage();
    for (let index = 0; index <= MAPPING_MEMORY_CAPACITY; index += 1) {
      await recordConfirmedMapping(
        {
          pageUrl: 'https://jobs.example/apply',
          field: field({ name: `field-${index}` }),
          profileKey: 'basics.fullName',
          explicitConfirmation: true,
          fillSucceeded: true,
          now: index,
        },
        storage,
      );
    }
    expect((await getMappingMemoryStats(storage)).mappings).toBe(MAPPING_MEMORY_CAPACITY);
    await clearMappingMemory(storage);
    expect((await getMappingMemoryStats(storage)).mappings).toBe(0);
    expect(await undoLastMappingChange(storage)).toBe(false);
  });

  it('stores no field text, page path or filled value', async () => {
    const storage = memoryStorage();
    await recordConfirmedMapping(
      {
        pageUrl: 'https://jobs.example/private/application/123?token=secret',
        field: field({ label: '身份证号码' }),
        profileKey: 'basics.identityNumber',
        explicitConfirmation: true,
        fillSucceeded: true,
      },
      storage,
    );
    const serialized = JSON.stringify([...storage.values.values()]);
    expect(serialized).not.toContain('身份证号码');
    expect(serialized).not.toContain('/private/application');
    expect(serialized).not.toContain('token=secret');
    expect(serialized).not.toContain('林同学');
    const state = [...storage.values.values()][0] as MappingMemoryState;
    expect(state.entries[0]!.site).toBe('jobs.example');
  });

  it('serializes same-context mutations when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = runExclusiveBrowserMemoryMutation(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = runExclusiveBrowserMemoryMutation(async () => {
      events.push('second:start');
      events.push('second:end');
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('requests an exclusive Web Lock for browser-backed mutations', async () => {
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: () => Promise<string>) => callback());
    vi.stubGlobal('navigator', { locks: { request } });

    await expect(runExclusiveBrowserMemoryMutation(async () => 'done')).resolves.toBe('done');
    expect(request).toHaveBeenCalledWith(
      'autocv.mappingMemory.mutation.v1',
      { mode: 'exclusive' },
      expect.any(Function),
    );
  });
});
