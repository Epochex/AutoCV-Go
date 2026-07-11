import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, emptyProject } from './defaults';
import { matchFields } from './matcher';
import type { FieldDescriptor, ResumeProfile } from './types';

const field = (overrides: Partial<FieldDescriptor>): FieldDescriptor => ({
  id: crypto.randomUUID(),
  tag: 'input',
  type: 'text',
  label: '',
  name: '',
  placeholder: '',
  section: '',
  options: [],
  currentValue: '',
  occurrence: 0,
  ...overrides,
});

describe('matchFields', () => {
  it('matches common Chinese basic fields', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.basics.fullName = '张三';
    profile.basics.email = 'zhangsan@example.com';

    const matches = matchFields(
      [field({ label: '姓名' }), field({ label: '电子邮箱', type: 'email' })],
      profile,
    );

    expect(matches.map((match) => match.value)).toEqual(['张三', 'zhangsan@example.com']);
  });

  it('uses field occurrence to align repeated project sections', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.projects = [
      { ...emptyProject(), name: '项目一' },
      { ...emptyProject(), name: '项目二' },
    ];

    const matches = matchFields(
      [field({ label: '项目名称', occurrence: 0 }), field({ label: '项目名称', occurrence: 1 })],
      profile,
    );

    expect(matches.map((match) => match.value)).toEqual(['项目一', '项目二']);
  });

  it('does not overwrite populated fields during matching', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.basics.phone = '13800000000';
    expect(matchFields([field({ label: '手机号', currentValue: '13900000000' })], profile)).toEqual([]);
  });
});
