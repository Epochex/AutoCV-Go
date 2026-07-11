export type BasicProfile = {
  fullName: string;
  gender: string;
  birthDate: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  identityNumber: string;
  politicalStatus: string;
  expectedRole: string;
  expectedCity: string;
  expectedSalary: string;
  selfIntroduction: string;
};

export type EducationEntry = {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
  ranking: string;
  description: string;
};

export type ExperienceEntry = {
  id: string;
  organization: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
};

export type ProjectEntry = {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  link: string;
  description: string;
};

export type ResearchEntry = ProjectEntry;
export type OpenSourceEntry = ProjectEntry;

export type CustomField = {
  id: string;
  label: string;
  value: string;
  aliases: string;
};

export type ResumeProfile = {
  version: 3;
  basics: BasicProfile;
  education: EducationEntry[];
  work: ExperienceEntry[];
  internship: ExperienceEntry[];
  projects: ProjectEntry[];
  research: ResearchEntry[];
  openSource: OpenSourceEntry[];
  skills: string;
  languages: string;
  awards: string;
  customFields: CustomField[];
};

export type AiSettings = {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
};

export type ExtensionSettings = {
  autoFillJobPages: boolean;
  useAiForAmbiguousFields: boolean;
  overwriteExisting: boolean;
  ai: AiSettings;
};

export type FieldDescriptor = {
  id: string;
  tag: string;
  type: string;
  label: string;
  name: string;
  placeholder: string;
  section: string;
  options: string[];
  currentValue: string;
  occurrence: number;
};

export type ProfileCandidate = {
  key: string;
  label: string;
  aliases: string[];
  value: string;
  category: string;
  repeatIndex?: number;
};

export type FieldMatch = {
  fieldId: string;
  profileKey: string;
  fieldLabel: string;
  profileLabel: string;
  value: string;
  confidence: number;
  source: 'rule' | 'ai';
  reason: string;
};

export type ScanResult = {
  url: string;
  title: string;
  likelyJobPage: boolean;
  fields: FieldDescriptor[];
};

export type FillResult = {
  filled: number;
  skipped: number;
  filledFieldIds: string[];
  skippedFieldIds: string[];
  failed: Array<{ fieldId: string; reason: string }>;
};

export type RuntimeMessage =
  | { type: 'AUTOCV_SCAN' }
  | { type: 'AUTOCV_FILL'; matches: FieldMatch[]; overwrite: boolean }
  | { type: 'AUTOCV_AUTO_RUN' };
