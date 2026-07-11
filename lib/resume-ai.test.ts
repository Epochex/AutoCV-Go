import { describe, expect, it } from 'vitest';
import { normalizeImportedProfile } from './resume-ai';

describe('normalizeImportedProfile', () => {
  it('normalizes partial AI JSON and assigns local ids', () => {
    const result = normalizeImportedProfile({
      basics: { fullName: ' 刘鑫 ', email: 'test@example.com' },
      education: [{ school: '清华大学', degree: '硕士' }],
      projects: [{ name: 'Agent 平台', description: '多智能体编排' }],
      skills: 'TypeScript, Python',
    });
    expect(result.basics.fullName).toBe('刘鑫');
    expect(result.education[0]).toMatchObject({ school: '清华大学', degree: '硕士' });
    expect(result.education[0]?.id).toBeTruthy();
    expect(result.projects[0]?.name).toBe('Agent 平台');
    expect(result.skills).toBe('TypeScript, Python');
    expect(result.work).toEqual([]);
  });
});
