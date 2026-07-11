import { DEFAULT_PROFILE } from './defaults';
import { isOpenSourceLikeProject, isResearchLikeProject } from './profile';
import type { AiSettings, ResumeProfile } from './types';
import type { ResumeFileFormat } from './file-text';

function stripJsonFence(content: string): string {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回有效 JSON');
  return cleaned.slice(start, end + 1);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(recordValue).filter((item) => Object.keys(item).length > 0) : [];
}

function newId(): string {
  return crypto.randomUUID();
}

export function normalizeImportedProfile(input: unknown): ResumeProfile {
  const source = recordValue(input);
  const basics = recordValue(source.basics);
  const profile = structuredClone(DEFAULT_PROFILE);

  for (const key of Object.keys(profile.basics) as Array<keyof ResumeProfile['basics']>) {
    profile.basics[key] = stringValue(basics[key]);
  }

  profile.education = recordArray(source.education).map((item) => ({
    id: newId(),
    school: stringValue(item.school),
    degree: stringValue(item.degree),
    major: stringValue(item.major),
    startDate: stringValue(item.startDate),
    endDate: stringValue(item.endDate),
    gpa: stringValue(item.gpa),
    ranking: stringValue(item.ranking),
    description: stringValue(item.description),
  }));

  const normalizeExperience = (value: unknown) =>
    recordArray(value).map((item) => ({
      id: newId(),
      organization: stringValue(item.organization),
      role: stringValue(item.role),
      startDate: stringValue(item.startDate),
      endDate: stringValue(item.endDate),
      description: stringValue(item.description),
    }));

  profile.work = normalizeExperience(source.work);
  profile.internship = normalizeExperience(source.internship);
  const normalizeProjectEntries = (value: unknown) => recordArray(value).map((item) => ({
    id: newId(),
    name: stringValue(item.name),
    role: stringValue(item.role),
    startDate: stringValue(item.startDate),
    endDate: stringValue(item.endDate),
    link: stringValue(item.link),
    description: stringValue(item.description),
  }));
  const importedProjects = normalizeProjectEntries(source.projects);
  const projectsWithoutResearch = importedProjects.filter((entry) => !isResearchLikeProject(entry));
  profile.projects = projectsWithoutResearch.filter((entry) => !isOpenSourceLikeProject(entry));
  profile.research = [
    ...normalizeProjectEntries(source.research),
    ...importedProjects.filter(isResearchLikeProject),
  ].filter(
    (entry, index, all) =>
      all.findIndex(
        (candidate) =>
          `${candidate.name}\u0000${candidate.startDate}\u0000${candidate.endDate}` ===
          `${entry.name}\u0000${entry.startDate}\u0000${entry.endDate}`,
      ) === index,
  );
  profile.openSource = [
    ...normalizeProjectEntries(source.openSource),
    ...projectsWithoutResearch.filter(isOpenSourceLikeProject),
  ].filter(
    (entry, index, all) =>
      all.findIndex(
        (candidate) =>
          `${candidate.name}\u0000${candidate.startDate}\u0000${candidate.endDate}` ===
          `${entry.name}\u0000${entry.startDate}\u0000${entry.endDate}`,
      ) === index,
  );
  profile.skills = stringValue(source.skills);
  profile.languages = stringValue(source.languages);
  profile.awards = stringValue(source.awards);
  profile.customFields = recordArray(source.customFields).map((item) => ({
    id: newId(),
    label: stringValue(item.label),
    value: stringValue(item.value),
    aliases: stringValue(item.aliases),
  }));
  return profile;
}

export async function parseResumeWithAi(
  text: string,
  format: ResumeFileFormat,
  settings: AiSettings,
): Promise<ResumeProfile> {
  if (!settings.enabled || !settings.apiKey) throw new Error('请先在设置中启用并配置 API Key');
  const sourceText = text.slice(0, 100_000);
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是中文技术简历结构化解析器。只提取原文明确出现的信息，禁止编造或润色。日期保留 YYYY-MM 或原文形式。必须按照原文标题分类：科研经历、论文、期刊或会议投稿一律放入 research；开源贡献、仓库贡献者、Maintainer 或 Contributor 一律放入 openSource；projects 只放工程项目、课程项目和个人项目，三者绝不能混放。无法归入固定类型的新栏目放入 customFields，label 使用原栏目标题，value 保留栏目正文。返回且只返回符合指定结构的 JSON。',
        },
        {
          role: 'user',
          content: `文件格式：${format}\n\n请按以下 JSON 结构解析；缺失字符串填空字符串，缺失数组填空数组：\n${JSON.stringify(DEFAULT_PROFILE)}\n\n简历原文：\n${sourceText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI 解析失败 (${response.status})：${message.slice(0, 240)}`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回内容为空');
  return normalizeImportedProfile(JSON.parse(stripJsonFence(content)));
}
