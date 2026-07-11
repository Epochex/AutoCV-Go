import { describe, expect, it } from 'vitest';
import { normalizeStoredProfile } from './profile';

describe('normalizeStoredProfile', () => {
  it('migrates research-like projects from legacy profiles without losing engineering projects', () => {
    const migrated = normalizeStoredProfile({
      version: 1,
      basics: { fullName: '张三' },
      projects: [
        { id: 'project', name: '网申助手', role: '核心开发', startDate: '', endDate: '', link: '', description: '' },
        { id: 'paper', name: '网络事件分析', role: '论文一作 | 投稿中', startDate: '2026-04', endDate: '2026-10', link: '', description: '' },
      ],
    });

    expect(migrated.version).toBe(2);
    expect(migrated.basics.fullName).toBe('张三');
    expect(migrated.projects.map((entry) => entry.name)).toEqual(['网申助手']);
    expect(migrated.research.map((entry) => entry.name)).toEqual(['网络事件分析']);
  });
});
