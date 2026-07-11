import { browser } from 'wxt/browser';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from './defaults';
import type { ExtensionSettings, ResumeProfile } from './types';

const PROFILE_KEY = 'autocv.profile.v1';
const SETTINGS_KEY = 'autocv.settings.v1';

export async function loadProfile(): Promise<ResumeProfile> {
  const stored = await browser.storage.local.get(PROFILE_KEY);
  return (stored[PROFILE_KEY] as ResumeProfile | undefined) ?? structuredClone(DEFAULT_PROFILE);
}

export async function saveProfile(profile: ResumeProfile): Promise<void> {
  await browser.storage.local.set({ [PROFILE_KEY]: profile });
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    ai: { ...DEFAULT_SETTINGS.ai, ...value?.ai },
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}
