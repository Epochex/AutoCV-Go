import { describe, expect, it } from 'vitest';
import { normalizeImportedProfile } from './resume-ai';

describe('normalizeImportedProfile', () => {
  it('normalizes partial AI JSON and assigns local ids', () => {
    const result = normalizeImportedProfile({
      basics: { fullName: ' 刘鑫 ', email: 'test@example.com' },
      education: [{ school: '清华大学', degree: '硕士' }],
      projects: [{ name: 'Agent 平台', description: '多智能体编排' }],
      research: [{ name: '网络事件分析', role: '论文一作', description: '会议投稿中' }],
      skills: 'TypeScript, Python',
    });
    expect(result.basics.fullName).toBe('刘鑫');
    expect(result.education[0]).toMatchObject({ school: '清华大学', degree: '硕士' });
    expect(result.education[0]?.id).toBeTruthy();
    expect(result.projects[0]?.name).toBe('Agent 平台');
    expect(result.research[0]).toMatchObject({ name: '网络事件分析', role: '论文一作' });
    expect(result.skills).toBe('TypeScript, Python');
    expect(result.work).toEqual([]);
  });

  it('repairs AI output that incorrectly puts papers in projects', () => {
    const result = normalizeImportedProfile({
      projects: [
        { name: '工程自动化平台', role: '核心开发' },
        { name: 'AiCS：网络事件分析', role: '论文一作 | CoNEXT 投稿中' },
        { name: 'DRST：性能分析框架', role: '论文二作 | SCI Q1' },
      ],
    });

    expect(result.projects.map((entry) => entry.name)).toEqual(['工程自动化平台']);
    expect(result.research.map((entry) => entry.name)).toEqual([
      'AiCS：网络事件分析',
      'DRST：性能分析框架',
    ]);
  });
});
