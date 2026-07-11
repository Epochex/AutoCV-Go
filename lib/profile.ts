import { DEFAULT_PROFILE } from './defaults';
import type { BasicProfile, ProjectEntry, ResearchEntry, ResumeProfile } from './types';

type StoredProfile = Partial<Omit<ResumeProfile, 'version' | 'basics'>> & {
  version?: number;
  basics?: Partial<BasicProfile>;
  projects?: ProjectEntry[];
  research?: ResearchEntry[];
};

const researchRolePattern =
  /(论文|作者|一作|二作|共同一作|通讯作者|投稿|录用|发表|期刊|会议|publication|paper|author|journal|conference|accepted|submitted|\bSCI\b)/i;

export function isResearchLikeProject(entry: Pick<ProjectEntry, 'name' | 'role'>): boolean {
  return researchRolePattern.test(`${entry.name}\n${entry.role}`);
}

function entries<T>(value: T[] | undefined, fallback: T[]): T[] {
  return (Array.isArray(value) ? value : fallback).map((entry) => ({ ...entry }));
}

function researchIdentity(entry: ResearchEntry): string {
  return `${entry.name}\u0000${entry.startDate}\u0000${entry.endDate}`
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s：:，,。.;；|｜]/g, '');
}

export function normalizeStoredProfile(input: unknown): ResumeProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return structuredClone(DEFAULT_PROFILE);
  const stored = input as StoredProfile;
  const originalProjects = entries(stored.projects, DEFAULT_PROFILE.projects);
  const shouldMigrateLegacyProjects = stored.version !== 2;
  const migratedResearch = shouldMigrateLegacyProjects
    ? originalProjects.filter(isResearchLikeProject)
    : [];
  const projects = shouldMigrateLegacyProjects
    ? originalProjects.filter((entry) => !isResearchLikeProject(entry))
    : originalProjects;
  const research = entries(stored.research, []).concat(migratedResearch);
  const uniqueResearch = research.filter(
    (entry, index, all) => all.findIndex((candidate) => researchIdentity(candidate) === researchIdentity(entry)) === index,
  );

  return {
    version: 2,
    basics: { ...DEFAULT_PROFILE.basics, ...stored.basics },
    education: entries(stored.education, DEFAULT_PROFILE.education),
    work: entries(stored.work, DEFAULT_PROFILE.work),
    internship: entries(stored.internship, DEFAULT_PROFILE.internship),
    projects,
    research: uniqueResearch,
    skills: typeof stored.skills === 'string' ? stored.skills : DEFAULT_PROFILE.skills,
    languages: typeof stored.languages === 'string' ? stored.languages : DEFAULT_PROFILE.languages,
    awards: typeof stored.awards === 'string' ? stored.awards : DEFAULT_PROFILE.awards,
    customFields: entries(stored.customFields, DEFAULT_PROFILE.customFields),
  };
}
