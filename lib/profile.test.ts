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
        { id: 'oss', name: '示例仓库代码贡献者', role: 'Contributor', startDate: '', endDate: '', link: '', description: '合入 PR #123' },
      ],
    });

    expect(migrated.version).toBe(3);
    expect(migrated.basics.fullName).toBe('张三');
    expect(migrated.projects.map((entry) => entry.name)).toEqual(['网申助手']);
    expect(migrated.research.map((entry) => entry.name)).toEqual(['网络事件分析']);
    expect(migrated.openSource.map((entry) => entry.name)).toEqual(['示例仓库代码贡献者']);
  });

  it('migrates open-source contributions from version 2 profiles', () => {
    const migrated = normalizeStoredProfile({
      version: 2,
      projects: [
        { id: 'project', name: '工程平台', role: '核心开发', startDate: '', endDate: '', link: '', description: '' },
        { id: 'oss', name: 'SDK 代码贡献者', role: '', startDate: '', endDate: '', link: '', description: '合入 PR #42' },
      ],
      research: [],
    });

    expect(migrated.projects.map((entry) => entry.name)).toEqual(['工程平台']);
    expect(migrated.openSource.map((entry) => entry.name)).toEqual(['SDK 代码贡献者']);
  });
});
