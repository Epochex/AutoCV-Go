import type {
  BasicProfile,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResumeProfile,
} from './types';

export type ResumeImportFormat = 'text' | 'pdf' | 'markdown' | 'md' | 'latex' | 'tex';

export type ParsedResumeProfile = Omit<Partial<ResumeProfile>, 'basics'> & {
  basics?: Partial<BasicProfile>;
};

export type MergeParsedProfileOptions = {
  arrayMode?: 'replace' | 'append';
};

type SectionKind =
  | 'header'
  | 'summary'
  | 'education'
  | 'work'
  | 'internship'
  | 'projects'
  | 'skills'
  | 'languages'
  | 'awards'
  | 'other';

type Section = { kind: SectionKind; title: string; lines: string[] };
type DateRange = { startDate: string; endDate: string; raw: string };

const DATE_TOKEN = String.raw`(?:19|20)\d{2}(?:\s*[.年/\-]\s*(?:1[0-2]|0?[1-9])(?:\s*月)?)?`;
const DATE_RANGE_RE = new RegExp(
  String.raw`(${DATE_TOKEN})\s*(?:--|—|–|~|至|到|-)\s*(${DATE_TOKEN}|至今|现在|Present|Current)`,
  'i',
);
const SINGLE_DATE_RE = new RegExp(`(${DATE_TOKEN})`, 'i');

const meaningful = (value: string | undefined): value is string => Boolean(value?.trim());

const compactLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t\u00a0]+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);

const cleanBullet = (line: string) =>
  line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*+•·]\s*/, '')
    .replace(/^\d{1,3}[.)、]\s+/, '')
    .trim();

const stableId = (kind: string, value: string, index: number) => {
  let hash = 2166136261;
  const input = `${kind}:${index}:${value}`;
  for (let cursor = 0; cursor < input.length; cursor += 1) {
    hash ^= input.charCodeAt(cursor);
    hash = Math.imul(hash, 16777619);
  }
  return `import-${kind}-${(hash >>> 0).toString(36)}`;
};

const normalizeDate = (value: string) => {
  const trimmed = value.trim();
  if (/^(至今|现在|present|current)$/i.test(trimmed)) return '至今';
  const match = trimmed.match(/((?:19|20)\d{2})(?:\s*[.年/\-]\s*(\d{1,2}))?/);
  if (!match) return trimmed;
  return match[2] ? `${match[1]}-${match[2].padStart(2, '0')}` : match[1] ?? trimmed;
};

const findDateRange = (value: string): DateRange | undefined => {
  const range = value.match(DATE_RANGE_RE);
  if (range?.[1] && range[2]) {
    return { startDate: normalizeDate(range[1]), endDate: normalizeDate(range[2]), raw: range[0] };
  }
  const single = value.match(SINGLE_DATE_RE);
  if (!single?.[1]) return undefined;
  return { startDate: normalizeDate(single[1]), endDate: '', raw: single[0] };
};

const stripMarkdown = (source: string) =>
  source
    .replace(/^---\s*$[\s\S]*?^---\s*$/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 $2')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

const readBracedArgument = (source: string, offset: number) => {
  let cursor = offset;
  while (/\s/.test(source[cursor] ?? '')) cursor += 1;
  if (source[cursor] !== '{') return undefined;
  const start = cursor + 1;
  let depth = 1;
  cursor += 1;
  while (cursor < source.length && depth > 0) {
    if (source[cursor] === '{' && source[cursor - 1] !== '\\') depth += 1;
    if (source[cursor] === '}' && source[cursor - 1] !== '\\') depth -= 1;
    cursor += 1;
  }
  if (depth !== 0) return undefined;
  return { value: source.slice(start, cursor - 1), end: cursor };
};

const replaceLatexCommand = (
  source: string,
  command: string,
  argumentCount: number,
  render: (args: string[]) => string,
) => {
  const token = `\\${command}`;
  let output = '';
  let cursor = 0;
  while (cursor < source.length) {
    const index = source.indexOf(token, cursor);
    if (index < 0) return output + source.slice(cursor);
    const boundary = source[index + token.length];
    if (boundary && /[A-Za-z@]/.test(boundary)) {
      output += source.slice(cursor, index + token.length);
      cursor = index + token.length;
      continue;
    }
    const args: string[] = [];
    let end = index + token.length;
    for (let argIndex = 0; argIndex < argumentCount; argIndex += 1) {
      const argument = readBracedArgument(source, end);
      if (!argument) break;
      args.push(argument.value);
      end = argument.end;
    }
    if (args.length !== argumentCount) {
      output += source.slice(cursor, index + token.length);
      cursor = index + token.length;
      continue;
    }
    output += source.slice(cursor, index) + render(args);
    cursor = end;
  }
  return output;
};

const latexInlineToText = (source: string) => {
  let value = source;
  value = replaceLatexCommand(value, 'href', 2, ([url = '', label = '']) => `${label} ${url}`);
  value = replaceLatexCommand(value, 'url', 1, ([url = '']) => url);
  for (const command of ['textbf', 'textit', 'emph', 'underline', 'texttt', 'mbox', 'textcolor']) {
    const count = command === 'textcolor' ? 2 : 1;
    value = replaceLatexCommand(value, command, count, (args) => args.at(-1) ?? '');
  }
  return value
    .replace(/\\(?:fontsize|raisebox)\s*\{[^{}]*}\s*\{[^{}]*}/g, ' ')
    .replace(/\\(?:color|includegraphics)(?:\[[^\]]*])?\s*\{[^{}]*}/g, ' ')
    .replace(/\\(?:selectfont|bfseries|itshape|centering|noindent|hfill|small|normalsize)\b/g, ' ')
    .replace(/\\(?:quad|qquad|enspace|,|;|!|hspace|vspace)(?:\{[^{}]*})?/g, ' ')
    .replace(/\\#/g, '#')
    .replace(/\\%/g, '%')
    .replace(/\\&/g, '&')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*])?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeLatex = (source: string) => {
  const begin = source.indexOf('\\begin{document}');
  const end = source.lastIndexOf('\\end{document}');
  let value = begin >= 0 ? source.slice(begin + '\\begin{document}'.length, end > begin ? end : undefined) : source;
  value = value.replace(/(^|[^\\])%.*$/gm, '$1');
  value = replaceLatexCommand(value, 'project', 2, ([name = '', description = '']) =>
    `\n@@PROJECT\t${latexInlineToText(name)}\t${latexInlineToText(description)}\n`,
  );
  value = replaceLatexCommand(value, 'datedentry', 3, ([title = '', dates = '', subtitle = '']) =>
    `\n@@ENTRY\t${latexInlineToText(title)}\t${latexInlineToText(subtitle)}\t${latexInlineToText(dates)}\n`,
  );
  value = replaceLatexCommand(value, 'sectionblock', 1, ([title = '']) =>
    `\n@@SECTION\t${latexInlineToText(title)}\n`,
  );
  value = replaceLatexCommand(value, 'resitem', 1, ([body = '']) => `\n- ${body}\n`);
  value = value
    .replace(/\\begin\{[^}]+}(?:\[[^\]]*])?/g, '\n')
    .replace(/\\end\{[^}]+}/g, '\n')
    .replace(/\\item(?:\[[^\]]*])?/g, '\n- ')
    .replace(/\\\\(?:\[[^\]]*])?/g, '\n');
  return value
    .split(/\r?\n/)
    .map((line) => (line.trimStart().startsWith('@@') ? line.trim() : latexInlineToText(line)))
    .join('\n')
    .replace(/\s*(@@(SECTION|ENTRY|PROJECT)\t)/g, '\n$1')
    .replace(/(@@(SECTION|ENTRY|PROJECT)[^\n]*)\s+/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const normalizeResumeText = (source: string, format: ResumeImportFormat = 'text') => {
  const normalizedFormat = format.toLowerCase();
  if (normalizedFormat === 'latex' || normalizedFormat === 'tex') return normalizeLatex(source);
  if (normalizedFormat === 'markdown' || normalizedFormat === 'md') return stripMarkdown(source);
  return source.replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
};

const sectionKind = (title: string): SectionKind => {
  const compact = title.replace(/\s+/g, '').toLowerCase();
  if (/(教育|学历|education|academic)/i.test(compact)) return 'education';
  if (/(实习|internship)/i.test(compact)) return 'internship';
  if (/(工作|任职|职业经历|employment|workexperience|experience)/i.test(compact)) return 'work';
  if (/(项目|科研|研究|论文|开源|project|research|publication)/i.test(compact)) return 'projects';
  if (/(技能|技术栈|专业能力|skill|technology)/i.test(compact)) return 'skills';
  if (/(语言|外语|language)/i.test(compact)) return 'languages';
  if (/(奖项|荣誉|证书|award|honou?r|certificate)/i.test(compact)) return 'awards';
  if (/(简介|概述|总结|自我评价|核心能力|summary|profile|about)/i.test(compact)) return 'summary';
  return 'other';
};

const isKnownPlainSectionHeading = (title: string) => {
  const compact = title.replace(/[\s：:|｜]/g, '').toLowerCase();
  return /^(?:教育(?:背景|经历)?|学历(?:背景|经历)?|项目与实习经历|实习经历|工作经历|职业经历|任职经历|项目经历|科研经历|研究经历|论文|开源贡献|技能|专业技能|技术栈|核心能力|专业能力|技术能力|语言能力|外语能力|荣誉奖项|奖项|荣誉|证书|个人简介|自我评价|summary|profile|about|education|academic|internship|workexperience|employment|experience|projects?|research|publications?|opensource|skills?|technology|languages?|awards?|honou?rs?|certificates?)$/i.test(
    compact,
  );
};

const splitSections = (source: string) => {
  const sections: Section[] = [{ kind: 'header', title: '', lines: [] }];
  let current = sections[0]!;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const latexHeading = line.match(/^@@SECTION\t(.+)$/);
    const markdownHeading = line.match(/^(#{1,2})\s+(.+)$/);
    const plainKind = sectionKind(cleanBullet(line));
    const isPlainHeading =
      plainKind !== 'other' &&
      isKnownPlainSectionHeading(cleanBullet(line)) &&
      line.length <= 24 &&
      !/[：:|]/.test(line) &&
      !findDateRange(line) &&
      !/^[-*+•]/.test(line);
    const markdownTitle = markdownHeading?.[2];
    const heading =
      latexHeading?.[1] ??
      (markdownTitle && sectionKind(markdownTitle) !== 'other' ? markdownTitle : undefined) ??
      (isPlainHeading ? cleanBullet(line) : undefined);
    if (heading) {
      current = { kind: sectionKind(heading), title: heading.trim(), lines: [] };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return sections;
};

const labelledValue = (text: string, labels: string[]) => {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return text.match(new RegExp(`(?:^|\\n|[|；;])\\s*(?:${escaped})\\s*[：:]\\s*([^\\n|；;]+)`, 'i'))?.[1]?.trim();
};

const parseBasics = (sections: Section[]): Partial<BasicProfile> => {
  const header = sections.find((section) => section.kind === 'header')?.lines.join('\n') ?? '';
  const allText = sections.flatMap((section) => section.lines).join('\n');
  const basics: Partial<BasicProfile> = {};
  const email = allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = allText.match(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d(?:[-\s]?\d){8}(?!\d)/)?.[0];
  const labelledName = labelledValue(header, ['姓名', 'Name']);
  const firstNameLike = compactLines(header)
    .map(cleanBullet)
    .find((line) => /^(?:[\u3400-\u9fff·]{2,8}|[A-Za-z]+(?:[ .'-][A-Za-z]+){1,3})$/.test(line));
  const expectedRole = labelledValue(allText, ['求职意愿', '求职目标', '目标岗位', '应聘职位', '期望职位', '职位']);
  const city = labelledValue(allText, ['现居', '现居地', '所在城市', '城市']) ?? allText.match(/现居(?:于|住)?\s*([^，,。；;\n]+)/)?.[1];
  const expectedCity = labelledValue(allText, ['意向城市', '期望城市', '工作地点']) ?? allText.match(/意向\s*([^，,。；;\n]+)/)?.[1];
  if (meaningful(labelledName ?? firstNameLike)) basics.fullName = (labelledName ?? firstNameLike)!.trim();
  if (meaningful(email)) basics.email = email;
  if (meaningful(phone)) basics.phone = phone.replace(/[\s-]/g, '').replace(/^\+?86/, '');
  if (meaningful(expectedRole)) basics.expectedRole = expectedRole;
  if (meaningful(city)) basics.city = city.trim();
  if (meaningful(expectedCity)) basics.expectedCity = expectedCity.trim();
  const address = labelledValue(allText, ['详细地址', '通讯地址', '地址']);
  const birthDate = labelledValue(allText, ['出生日期', '生日']);
  const gender = labelledValue(allText, ['性别']);
  const politicalStatus = labelledValue(allText, ['政治面貌']);
  const expectedSalary = labelledValue(allText, ['期望薪资', '期望工资', '薪资']);
  if (meaningful(address)) basics.address = address;
  if (meaningful(birthDate)) basics.birthDate = normalizeDate(birthDate);
  if (meaningful(gender)) basics.gender = gender;
  if (meaningful(politicalStatus)) basics.politicalStatus = politicalStatus;
  if (meaningful(expectedSalary)) basics.expectedSalary = expectedSalary;
  const summary = sections
    .filter((section) => section.kind === 'summary')
    .flatMap((section) => section.lines.map(cleanBullet))
    .filter(Boolean)
    .join('\n');
  if (summary) basics.selfIntroduction = summary;
  return basics;
};

type EntryBlock = { title: string; subtitle: string; dates: string; details: string[] };

const entryBlocks = (lines: string[]): EntryBlock[] => {
  const blocks: EntryBlock[] = [];
  let current: EntryBlock | undefined;
  const flush = () => {
    if (current && (current.title || current.subtitle || current.dates || current.details.length)) blocks.push(current);
    current = undefined;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    const marker = line.match(/^@@ENTRY\t([^\t]*)\t([^\t]*)\t(.*)$/);
    if (marker) {
      flush();
      current = { title: marker[1] ?? '', subtitle: marker[2] ?? '', dates: marker[3] ?? '', details: [] };
      continue;
    }
    if (/^@@PROJECT\t/.test(line)) {
      if (current) current.details.push(line);
      continue;
    }
    if (!line || /^\|?\s*:?-{3,}/.test(line)) continue;
    const primaryBullet = /^\s*•\s*/.test(line);
    const clean = cleanBullet(line);
    const date = findDateRange(clean);
    const levelThree = /^#{3,6}\s+/.test(line);
    if (levelThree || (date && current && findDateRange(`${current.dates} ${current.title} ${current.subtitle}`))) {
      flush();
    }
    if (!current) current = { title: '', subtitle: '', dates: '', details: [] };
    if (date && !current.dates) {
      current.dates = date.raw;
      const withoutDate = clean.replace(date.raw, '').replace(/^[|｜·,，\s-]+|[|｜·,，\s-]+$/g, '');
      if (withoutDate) {
        if (!current.title) current.title = withoutDate;
        else current.subtitle = [current.subtitle, withoutDate].filter(Boolean).join(' | ');
      }
    } else if (!current.title) {
      current.title = clean;
    } else if (!current.subtitle && !primaryBullet && !/^[-*+•]/.test(line) && !/^@@/.test(line)) {
      current.subtitle = clean;
    } else {
      current.details.push(primaryBullet ? `@@BULLET\t${clean}` : clean);
    }
  }
  flush();
  return blocks.filter((block) => Boolean(findDateRange(`${block.dates} ${block.title} ${block.subtitle}`)));
};

const splitColumns = (value: string) =>
  value
    .replace(/^\||\|$/g, '')
    .split(/\s*(?:\||｜|\t| {2,})\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

const parseEducation = (sections: Section[]): EducationEntry[] => {
  const entries = sections.filter((section) => section.kind === 'education').flatMap((section) => entryBlocks(section.lines));
  return entries.map((entry, index) => {
    const date = findDateRange(`${entry.dates} ${entry.title} ${entry.subtitle}`);
    const rawParts = splitColumns(`${entry.title} | ${entry.subtitle}`)
      .map((part) => (date ? part.replace(date.raw, '').trim() : part))
      .filter(Boolean);
    const school = rawParts.find((part) => /(大学|学院|学校|研究所|university|college|institute)/i.test(part)) ?? rawParts[0] ?? '';
    const degreePart = rawParts.find((part) => /(博士|硕士|学士|本科|专科|ph\.?d|master|bachelor|mba)/i.test(part)) ?? '';
    const degree = degreePart.match(/博士|硕士|学士|本科|专科|Ph\.?D|Master|Bachelor|MBA/i)?.[0] ?? '';
    const majorFromDegree = degreePart
      .replace(/博士|硕士|学士|本科|专科|Ph\.?D|Master|Bachelor|MBA/gi, '')
      .replace(/^[\s|·,，\-/]+|[\s|·,，\-/]+$/g, '');
    const major =
      majorFromDegree || rawParts.find((part) => part !== school && part !== degreePart && !/^(学院|院系)/.test(part)) || '';
    const description = entry.details.filter((line) => !/^@@PROJECT/.test(line)).join('\n');
    return {
      id: stableId('education', `${school}${date?.raw ?? ''}`, index),
      school,
      degree,
      major,
      startDate: date?.startDate ?? '',
      endDate: date?.endDate ?? '',
      gpa: `${entry.title} ${entry.subtitle} ${description}`.match(/GPA\s*[：:]?\s*([\d.]+(?:\s*\/\s*[\d.]+)?)/i)?.[1] ?? '',
      ranking: `${entry.title} ${entry.subtitle} ${description}`.match(/(?:排名|Rank)\s*[：:]?\s*([^|，,；;\n]+)/i)?.[1]?.trim() ?? '',
      description,
    };
  });
};

const parseExperience = (sections: Section[], kind: 'work' | 'internship'): ExperienceEntry[] => {
  const entries = sections.filter((section) => section.kind === kind).flatMap((section) => entryBlocks(section.lines));
  return entries.map((entry, index) => {
    const date = findDateRange(`${entry.dates} ${entry.title} ${entry.subtitle}`);
    const parts = splitColumns(`${entry.title} | ${entry.subtitle}`)
      .map((part) => (date ? part.replace(date.raw, '').trim() : part))
      .filter(Boolean);
    const organization =
      parts.find((part) => /(公司|集团|实验室|研究院|研究所|大学|company|inc\.?|ltd\.?|laboratory|lab\b)/i.test(part)) ??
      parts[0] ??
      '';
    const rolePattern = /(工程师|开发|研究|产品|运营|分析|设计|实习|engineer|developer|research|intern|manager)/i;
    const roleDetailIndex = entry.details.findIndex(
      (line) => !/^@@(?:PROJECT|BULLET)\t/.test(line) && rolePattern.test(cleanBullet(line)),
    );
    const roleFromDetail = roleDetailIndex >= 0 ? cleanBullet(entry.details[roleDetailIndex] ?? '') : '';
    const role =
      parts.find((part) => part !== organization && rolePattern.test(part)) ??
      parts.find((part) => part !== organization) ??
      roleFromDetail;
    return {
      id: stableId(kind, `${organization}${role}${date?.raw ?? ''}`, index),
      organization,
      role,
      startDate: date?.startDate ?? '',
      endDate: date?.endDate ?? '',
      description: entry.details
        .filter((_, detailIndex) => detailIndex !== roleDetailIndex)
        .map((line) => line.replace(/^@@PROJECT\t([^\t]*)\t(.*)$/, '$1：$2'))
        .map((line) => line.replace(/^@@BULLET\t/, ''))
        .filter(Boolean)
        .join('\n'),
    };
  });
};

const parseProjects = (sections: Section[]): ProjectEntry[] => {
  const projects: ProjectEntry[] = [];
  const seen = new Set<string>();
  const add = (project: Omit<ProjectEntry, 'id'>) => {
    const key = `${project.name}\u0000${project.startDate}\u0000${project.description}`;
    if (!project.name || seen.has(key)) return;
    seen.add(key);
    projects.push({ ...project, id: stableId('project', key, projects.length) });
  };
  for (const section of sections) {
    if (section.kind === 'work' || section.kind === 'internship') {
      let activeExperienceDate: DateRange | undefined;
      let activeExperienceRole = '';
      let awaitingExperienceRole = false;
      for (let index = 0; index < section.lines.length; index += 1) {
        const rawLine = section.lines[index]!;
        const entryMarker = rawLine.match(/^@@ENTRY\t([^\t]*)\t([^\t]*)\t(.*)$/);
        if (entryMarker) {
          activeExperienceDate = findDateRange(entryMarker[3] ?? '');
          activeExperienceRole = cleanBullet(entryMarker[2] ?? '');
          awaitingExperienceRole = !activeExperienceRole;
          continue;
        }
        const projectMarker = rawLine.match(/^@@PROJECT\t([^\t]*)\t(.*)$/);
        if (projectMarker?.[1]) {
          const description = projectMarker[2] ?? '';
          add({
            name: projectMarker[1],
            role: activeExperienceRole,
            startDate: activeExperienceDate?.startDate ?? '',
            endDate: activeExperienceDate?.endDate ?? '',
            link: description.match(/https?:\/\/\S+/)?.[0] ?? '',
            description,
          });
          continue;
        }
        const clean = cleanBullet(rawLine);
        const looseRange = clean.match(/((?:19|20)\d{2})[.\-/年](\d{1,2})\s*[–—−~-]\s*((?:19|20)\d{2})[.\-/年](\d{1,2})/);
        const date =
          findDateRange(clean) ??
          (looseRange
            ? {
                startDate: `${looseRange[1]}-${looseRange[2]!.padStart(2, '0')}`,
                endDate: `${looseRange[3]}-${looseRange[4]!.padStart(2, '0')}`,
                raw: looseRange[0],
              }
            : undefined);
        if (date) {
          activeExperienceDate = date;
          activeExperienceRole = '';
          awaitingExperienceRole = true;
          continue;
        }
        if (
          awaitingExperienceRole &&
          !/^\s*[•–—-]\s*/.test(rawLine) &&
          !/^@@/.test(rawLine) &&
          /(工程师|开发|研究|产品|运营|分析|设计|实习|engineer|developer|research|intern|manager)/i.test(clean)
        ) {
          activeExperienceRole = clean;
          awaitingExperienceRole = false;
          continue;
        }
        const project = rawLine.match(/^\s*•\s*([^：:]{2,80})[：:]\s*(.*)$/);
        if (!project?.[1]) continue;
        const continuation: string[] = [];
        for (let cursor = index + 1; cursor < section.lines.length; cursor += 1) {
          const next = section.lines[cursor]!;
          if (/^\s*•\s*/.test(next) || findDateRange(next)) break;
          continuation.push(cleanBullet(next));
        }
        const description = [project[2] ?? '', ...continuation].filter(Boolean).join('\n');
        add({
          name: project[1].trim(),
          role: activeExperienceRole,
          startDate: activeExperienceDate?.startDate ?? '',
          endDate: activeExperienceDate?.endDate ?? '',
          link: description.match(/https?:\/\/\S+/)?.[0] ?? '',
          description,
        });
      }
    } else {
      for (const line of section.lines) {
        const marker = line.match(/^@@PROJECT\t([^\t]*)\t(.*)$/);
        if (marker?.[1]) {
          add({ name: marker[1], role: '', startDate: '', endDate: '', link: marker[2]?.match(/https?:\/\/\S+/)?.[0] ?? '', description: marker[2] ?? '' });
        }
      }
    }
    if (section.kind !== 'projects') continue;
    for (const entry of entryBlocks(section.lines)) {
      const date = findDateRange(`${entry.dates} ${entry.title} ${entry.subtitle}`);
      const parts = splitColumns(`${entry.title} | ${entry.subtitle}`)
        .map((part) => (date ? part.replace(date.raw, '').trim() : part))
        .filter(Boolean);
      const description = entry.details
        .map((line) => line.replace(/^@@BULLET\t/, ''))
        .map(cleanBullet)
        .filter(Boolean)
        .join('\n');
      const link = `${entry.title} ${entry.subtitle} ${description}`.match(/https?:\/\/\S+/)?.[0] ?? '';
      add({
        name: parts[0] ?? '',
        role: parts.slice(1).join(' | '),
        startDate: date?.startDate ?? '',
        endDate: date?.endDate ?? '',
        link,
        description,
      });
    }
  }
  return projects;
};

const sectionText = (sections: Section[], kind: SectionKind) =>
  sections
    .filter((section) => section.kind === kind)
    .flatMap((section) => section.lines.map(cleanBullet))
    .filter((line) => line && !/^@@/.test(line))
    .join('\n');

export const parseResumeText = (source: string, format: ResumeImportFormat = 'text'): ParsedResumeProfile => {
  const normalized = normalizeResumeText(source, format);
  const sections = splitSections(normalized);
  const basics = parseBasics(sections);
  const education = parseEducation(sections);
  const work = parseExperience(sections, 'work');
  const internship = parseExperience(sections, 'internship');
  const projects = parseProjects(sections);
  const skills =
    sectionText(sections, 'skills') ||
    sections
      .filter((section) => section.kind === 'summary' && /(核心能力|专业能力|技术能力)/.test(section.title))
      .flatMap((section) => section.lines.map(cleanBullet))
      .filter(Boolean)
      .join('\n');
  const languages = sectionText(sections, 'languages');
  const awards = sectionText(sections, 'awards');
  const result: ParsedResumeProfile = { basics };
  if (education.length) result.education = education;
  if (work.length) result.work = work;
  if (internship.length) result.internship = internship;
  if (projects.length) result.projects = projects;
  if (skills) result.skills = skills;
  if (languages) result.languages = languages;
  if (awards) result.awards = awards;
  return result;
};

const nonEmptyRecord = <T extends object>(base: T, patch: Partial<T> | undefined): T => {
  const output = { ...base };
  if (!patch) return output;
  for (const [key, value] of Object.entries(patch) as Array<[keyof T, T[keyof T]]>) {
    if (typeof value === 'string' && !value.trim()) continue;
    if (value !== undefined && value !== null) output[key] = value;
  }
  return output;
};

export const mergeParsedProfile = (
  current: ResumeProfile,
  parsed: ParsedResumeProfile,
  options: MergeParsedProfileOptions = {},
): ResumeProfile => {
  const arrayMode = options.arrayMode ?? 'replace';
  const entrySignature = (entry: object) =>
    Object.entries(entry)
      .filter(([key, value]) => key !== 'id' && typeof value === 'string' && value.trim())
      .map(([key, value]) => `${key}:${String(value).trim()}`)
      .join('|');
  const identityPart = (value: unknown) =>
    typeof value === 'string'
      ? value.normalize('NFKC').toLowerCase().replace(/[\s：:，,。.;；|｜]/g, '')
      : '';
  const entryIdentity = (entry: object, keys: string[]) => {
    const record = entry as Record<string, unknown>;
    const values = keys.map((key) => identityPart(record[key]));
    return values.some(Boolean) ? values.join('\u0000') : `full:${entrySignature(entry)}`;
  };
  const fillMissingEntryFields = <T>(existing: T, incoming: T): T => {
    const output = { ...(existing as object) } as Record<string, unknown>;
    for (const [key, value] of Object.entries(incoming as object)) {
      if (key === 'id') continue;
      const currentValue = output[key];
      const currentMissing = currentValue === undefined || currentValue === null || (typeof currentValue === 'string' && !currentValue.trim());
      if (currentMissing && value !== undefined && value !== null && (typeof value !== 'string' || value.trim())) output[key] = value;
    }
    return output as T;
  };
  const mergeArray = <T>(
    existing: T[],
    incoming: T[] | undefined,
    identityKeys: string[],
    mode: 'replace' | 'append' = arrayMode,
  ) => {
    if (!incoming?.length) return existing.map((item) => ({ ...item }));
    const incomingNonEmpty = incoming.filter((item) => entrySignature(item as object));
    const seed = mode === 'append' ? existing.filter((item) => entrySignature(item as object)) : [];
    const merged = seed.map((item) => ({ ...item }));
    const positions = new Map<string, number>();
    merged.forEach((item, index) => positions.set(entryIdentity(item as object, identityKeys), index));
    for (const incomingItem of incomingNonEmpty) {
      const identity = entryIdentity(incomingItem as object, identityKeys);
      const existingIndex = positions.get(identity);
      if (existingIndex === undefined) {
        positions.set(identity, merged.length);
        merged.push({ ...incomingItem });
      } else {
        merged[existingIndex] = fillMissingEntryFields(merged[existingIndex]!, incomingItem);
      }
    }
    return merged;
  };
  return {
    ...current,
    basics: nonEmptyRecord(current.basics, parsed.basics),
    education: mergeArray(current.education, parsed.education, ['school', 'startDate', 'endDate']),
    work: mergeArray(current.work, parsed.work, ['organization', 'startDate', 'endDate']),
    internship: mergeArray(current.internship, parsed.internship, ['organization', 'startDate', 'endDate']),
    projects: mergeArray(current.projects, parsed.projects, ['name', 'startDate', 'endDate']),
    customFields: mergeArray(current.customFields, parsed.customFields, ['label'], 'append'),
    skills: meaningful(parsed.skills) ? parsed.skills : current.skills,
    languages: meaningful(parsed.languages) ? parsed.languages : current.languages,
    awards: meaningful(parsed.awards) ? parsed.awards : current.awards,
  };
};
