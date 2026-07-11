import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, emptyEducation, emptyOpenSource, emptyProject, emptyResearch } from './defaults';
import { matchFields, profileCandidates, resolveCandidate } from './matcher';
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
  required: false,
  fillCapability: 'auto',
  manualReason: '',
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

  it('uses stable entry ids and keeps a candidate key valid after repeated entries are reordered', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.education = [
      { ...emptyEducation(), id: 'undergrad-id', school: '本科院校' },
      { ...emptyEducation(), id: 'graduate-id', school: '硕士院校' },
    ];
    const stableKey = profileCandidates(profile).find((candidate) => candidate.value === '硕士院校')?.key;

    expect(stableKey).toBe('education.byId.graduate-id.school');
    profile.education.reverse();
    expect(resolveCandidate(profile, stableKey!)?.value).toBe('硕士院校');
  });

  it('resolves legacy index keys but returns the new stable key', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.education = [
      { ...emptyEducation(), id: 'undergrad-id', school: '本科院校' },
      { ...emptyEducation(), id: 'graduate-id', school: '硕士院校' },
    ];

    expect(resolveCandidate(profile, 'education.1.school')).toMatchObject({
      key: 'education.byId.graduate-id.school',
      value: '硕士院校',
    });
  });

  it('matches recruitment-site personal advantage wording to the self introduction', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.basics.selfIntroduction = '具备扎实的工程实践和快速学习能力。';

    const matches = matchFields(
      [field({ label: '个人优势', placeholder: '建议输入个人优势描述，1000字以内' })],
      profile,
    );

    expect(matches).toEqual([
      expect.objectContaining({
        profileKey: 'basics.selfIntroduction',
        value: '具备扎实的工程实践和快速学习能力。',
      }),
    ]);
  });

  it('derives a phone country code for recruitment forms', () => {
    const profile: ResumeProfile = structuredClone(DEFAULT_PROFILE);
    profile.basics.phone = '13800138000';

    expect(matchFields([field({ label: '区号' })], profile)).toEqual([
      expect.objectContaining({ profileKey: 'derived.phoneCountryCode', value: '+86' }),
    ]);
  });
});
