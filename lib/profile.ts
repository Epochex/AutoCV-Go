import { DEFAULT_PROFILE } from './defaults';
import type { BasicProfile, OpenSourceEntry, ProjectEntry, ResearchEntry, ResumeProfile } from './types';

type StoredProfile = Partial<Omit<ResumeProfile, 'version' | 'basics'>> & {
  version?: number;
  basics?: Partial<BasicProfile>;
  projects?: ProjectEntry[];
  research?: ResearchEntry[];
  openSource?: OpenSourceEntry[];
};

const researchRolePattern =
  /(论文|作者|一作|二作|共同一作|通讯作者|投稿|录用|发表|期刊|会议|publication|paper|author|journal|conference|accepted|submitted|\bSCI\b)/i;

export function isResearchLikeProject(entry: Pick<ProjectEntry, 'name' | 'role'>): boolean {
  return researchRolePattern.test(`${entry.name}\n${entry.role}`);
}

const openSourcePattern =
  /(开源贡献|代码贡献者|仓库贡献者|项目维护者|合入\s*(?:了\s*)?PR|提交\s*PR\s*#|maintainer|contributor|open[ -]?source contribution|merged?\s+PR)/i;

export function isOpenSourceLikeProject(
  entry: Pick<ProjectEntry, 'name' | 'role' | 'description'>,
): boolean {
  return openSourcePattern.test(`${entry.name}\n${entry.role}\n${entry.description}`);
}

function entries<T>(value: T[] | undefined, fallback: T[]): T[] {
  return (Array.isArray(value) ? value : fallback).map((entry) => ({ ...entry }));
}

function entryIdentity(entry: ProjectEntry): string {
  return `${entry.name}\u0000${entry.startDate}\u0000${entry.endDate}`
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s：:，,。.;；|｜]/g, '');
}

export function normalizeStoredProfile(input: unknown): ResumeProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return structuredClone(DEFAULT_PROFILE);
  const stored = input as StoredProfile;
  const sourceVersion = typeof stored.version === 'number' ? stored.version : 1;
  const originalProjects = entries(stored.projects, DEFAULT_PROFILE.projects);
  const migratedResearch = sourceVersion < 2
    ? originalProjects.filter(isResearchLikeProject)
    : [];
  const projectsWithoutResearch = sourceVersion < 2
    ? originalProjects.filter((entry) => !isResearchLikeProject(entry))
    : originalProjects;
  const migratedOpenSource = sourceVersion < 3
    ? projectsWithoutResearch.filter(isOpenSourceLikeProject)
    : [];
  const projects = sourceVersion < 3
    ? projectsWithoutResearch.filter((entry) => !isOpenSourceLikeProject(entry))
    : projectsWithoutResearch;
  const research = entries(stored.research, []).concat(migratedResearch);
  const uniqueResearch = research.filter(
    (entry, index, all) => all.findIndex((candidate) => entryIdentity(candidate) === entryIdentity(entry)) === index,
  );
  const openSource = entries(stored.openSource, []).concat(migratedOpenSource);
  const uniqueOpenSource = openSource.filter(
    (entry, index, all) => all.findIndex((candidate) => entryIdentity(candidate) === entryIdentity(entry)) === index,
  );

  return {
    version: 3,
    basics: { ...DEFAULT_PROFILE.basics, ...stored.basics },
    education: entries(stored.education, DEFAULT_PROFILE.education),
    work: entries(stored.work, DEFAULT_PROFILE.work),
    internship: entries(stored.internship, DEFAULT_PROFILE.internship),
    projects,
    research: uniqueResearch,
    openSource: uniqueOpenSource,
    skills: typeof stored.skills === 'string' ? stored.skills : DEFAULT_PROFILE.skills,
    languages: typeof stored.languages === 'string' ? stored.languages : DEFAULT_PROFILE.languages,
    awards: typeof stored.awards === 'string' ? stored.awards : DEFAULT_PROFILE.awards,
    customFields: entries(stored.customFields, DEFAULT_PROFILE.customFields),
  };
}
