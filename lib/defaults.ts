import type { ExtensionSettings, ResumeProfile } from './types';

const id = () => crypto.randomUUID();

export const emptyEducation = () => ({
  id: id(),
  school: '',
  degree: '',
  major: '',
  startDate: '',
  endDate: '',
  gpa: '',
  ranking: '',
  description: '',
});

export const emptyExperience = () => ({
  id: id(),
  organization: '',
  role: '',
  startDate: '',
  endDate: '',
  description: '',
});

export const emptyProject = () => ({
  id: id(),
  name: '',
  role: '',
  startDate: '',
  endDate: '',
  link: '',
  description: '',
});

export const emptyResearch = emptyProject;
export const emptyOpenSource = emptyProject;

export const emptyCustomField = () => ({
  id: id(),
  label: '',
  value: '',
  aliases: '',
});

export const DEFAULT_PROFILE: ResumeProfile = {
  version: 3,
  basics: {
    fullName: '',
    gender: '',
    birthDate: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    identityNumber: '',
    politicalStatus: '',
    expectedRole: '',
    expectedCity: '',
    expectedSalary: '',
    selfIntroduction: '',
  },
  education: [emptyEducation()],
  work: [],
  internship: [emptyExperience()],
  projects: [emptyProject()],
  research: [],
  openSource: [],
  skills: '',
  languages: '',
  awards: '',
  customFields: [],
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  autoFillJobPages: false,
  useAiForAmbiguousFields: true,
  overwriteExisting: false,
  ai: {
    enabled: false,
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKey: '',
    model: 'deepseek-chat',
  },
};
