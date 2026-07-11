import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, emptyOpenSource, emptyProject, emptyResearch } from './defaults';
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

  it('does not map projectName fields to the candidate full name', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.basics.fullName = '张三';
    profile.projects = [];
    expect(matchFields([field({ label: '项目名称', name: 'projectName1' })], profile)).toEqual([]);
  });

  it('matches research fields separately from project fields', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.projects = [{ ...emptyProject(), name: '工程项目' }];
    profile.research = [{ ...emptyResearch(), name: '证据准入论文', role: '论文一作' }];

    const matches = matchFields(
      [field({ label: '论文题目' }), field({ label: '作者排序' })],
      profile,
    );

    expect(matches.map((match) => match.value)).toEqual(['证据准入论文', '论文一作']);
    expect(matches.every((match) => match.profileKey.startsWith('research.'))).toBe(true);
  });

  it('matches open-source contribution fields separately', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.openSource = [{ ...emptyOpenSource(), name: '示例 SDK', role: 'Maintainer' }];

    const matches = matchFields(
      [field({ label: '开源仓库' }), field({ label: '贡献者类型' })],
      profile,
    );

    expect(matches.map((match) => match.value)).toEqual(['示例 SDK', 'Maintainer']);
    expect(matches.every((match) => match.profileKey.startsWith('openSource.'))).toBe(true);
  });
});
