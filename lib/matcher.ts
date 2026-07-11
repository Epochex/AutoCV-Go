import type { FieldDescriptor, FieldMatch, ProfileCandidate, ResumeProfile } from './types';

const BASIC_FIELDS: Array<{
  key: keyof ResumeProfile['basics'];
  label: string;
  aliases: string[];
}> = [
  { key: 'fullName', label: '姓名', aliases: ['姓名', '真实姓名', '名字', 'name', 'full name'] },
  { key: 'gender', label: '性别', aliases: ['性别', 'gender', 'sex'] },
  { key: 'birthDate', label: '出生日期', aliases: ['出生日期', '出生年月', '生日', 'birth date', 'birthday'] },
  { key: 'phone', label: '手机号', aliases: ['手机号', '手机号码', '联系电话', '电话', 'mobile', 'phone'] },
  { key: 'email', label: '邮箱', aliases: ['邮箱', '电子邮箱', '邮件', 'email', 'e-mail'] },
  { key: 'city', label: '所在城市', aliases: ['所在城市', '现居城市', '居住地', '所在地', 'current city'] },
  { key: 'address', label: '联系地址', aliases: ['联系地址', '详细地址', '通讯地址', '地址', 'address'] },
  { key: 'identityNumber', label: '身份证号', aliases: ['身份证号', '身份证号码', '证件号码', 'id number'] },
  { key: 'politicalStatus', label: '政治面貌', aliases: ['政治面貌'] },
  { key: 'expectedRole', label: '期望职位', aliases: ['期望职位', '期望岗位', '意向岗位', '申请职位', 'position'] },
  { key: 'expectedCity', label: '期望城市', aliases: ['期望城市', '期望工作地', '工作地点', '意向城市'] },
  { key: 'expectedSalary', label: '期望薪资', aliases: ['期望薪资', '期望月薪', '薪资要求', 'salary'] },
  { key: 'selfIntroduction', label: '自我介绍', aliases: ['自我介绍', '自我评价', '个人总结', '个人简介', 'summary'] },
];

const REPEAT_FIELDS = {
  education: [
    ['school', '学校', ['学校', '院校', '毕业院校', '学校名称', 'university', 'school']],
    ['degree', '学历', ['学历', '学位', 'degree']],
    ['major', '专业', ['专业', '专业名称', 'major']],
    ['startDate', '教育开始时间', ['入学时间', '开始时间', '起始时间', 'start date']],
    ['endDate', '教育结束时间', ['毕业时间', '结束时间', '截止时间', 'end date']],
    ['gpa', 'GPA', ['gpa', '绩点', '平均绩点']],
    ['ranking', '专业排名', ['专业排名', '成绩排名', '排名']],
    ['description', '教育描述', ['在校经历', '教育描述', '主修课程', '教育经历描述']],
  ],
  work: [
    ['organization', '公司名称', ['公司名称', '工作单位', '单位名称', '公司', 'company']],
    ['role', '职位名称', ['职位名称', '工作职位', '岗位名称', '职位', 'job title']],
    ['startDate', '工作开始时间', ['工作开始时间', '入职时间', '开始时间', 'start date']],
    ['endDate', '工作结束时间', ['工作结束时间', '离职时间', '结束时间', 'end date']],
    ['description', '工作描述', ['工作内容', '工作描述', '岗位职责', '工作经历描述']],
  ],
  internship: [
    ['organization', '实习公司', ['实习公司', '公司名称', '实习单位', '单位名称', 'company']],
    ['role', '实习岗位', ['实习岗位', '实习职位', '岗位名称', '职位名称', 'role']],
    ['startDate', '实习开始时间', ['实习开始时间', '开始时间', 'start date']],
    ['endDate', '实习结束时间', ['实习结束时间', '结束时间', 'end date']],
    ['description', '实习描述', ['实习内容', '实习描述', '工作内容', '岗位职责']],
  ],
  projects: [
    ['name', '项目名称', ['项目名称', '项目名', 'project name']],
    ['role', '项目角色', ['项目角色', '担任角色', '项目职位', '角色', 'role']],
    ['startDate', '项目开始时间', ['项目开始时间', '开始时间', 'start date']],
    ['endDate', '项目结束时间', ['项目结束时间', '结束时间', 'end date']],
    ['link', '项目链接', ['项目链接', '项目地址', 'project url', 'link']],
    ['description', '项目描述', ['项目描述', '项目内容', '项目介绍', 'project description']],
  ],
} as const;

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\u00a0:*：·_\-—()（）【】\[\]]+/g, '')
    .trim();
}

export function profileCandidates(profile: ResumeProfile): ProfileCandidate[] {
  const candidates: ProfileCandidate[] = BASIC_FIELDS.map((field) => ({
    key: `basics.${field.key}`,
    label: field.label,
    aliases: field.aliases,
    value: profile.basics[field.key],
    category: 'basics',
  }));

  (Object.keys(REPEAT_FIELDS) as Array<keyof typeof REPEAT_FIELDS>).forEach((category) => {
    profile[category].forEach((entry, repeatIndex) => {
      REPEAT_FIELDS[category].forEach(([key, label, aliases]) => {
        const value = entry[key as keyof typeof entry];
        if (typeof value === 'string') {
          candidates.push({
            key: `${category}.${repeatIndex}.${key}`,
            label,
            aliases: [...aliases],
            value,
            category,
            repeatIndex,
          });
        }
      });
    });
  });

  const simpleFields: Array<{
    key: 'skills' | 'languages' | 'awards';
    label: string;
    aliases: string[];
  }> = [
    { key: 'skills', label: '专业技能', aliases: ['专业技能', '技能', '技能特长', 'skills'] },
    { key: 'languages', label: '语言能力', aliases: ['语言能力', '外语水平', '英语水平', 'languages'] },
    { key: 'awards', label: '获奖经历', aliases: ['获奖经历', '荣誉奖项', '奖项', 'awards'] },
  ];
  simpleFields.forEach(({ key, label, aliases }) => {
    candidates.push({
      key,
      label,
      aliases,
      value: profile[key],
      category: key,
    });
  });

  profile.customFields.forEach((field) => {
    candidates.push({
      key: `customFields.${field.id}`,
      label: field.label,
      aliases: [field.label, ...field.aliases.split(/[,，\n]/).map((item) => item.trim())].filter(Boolean),
      value: field.value,
      category: 'custom',
    });
  });

  return candidates.filter((candidate) => candidate.value.trim().length > 0);
}

function fieldHaystack(field: FieldDescriptor): string {
  return normalizeText([field.label, field.name, field.placeholder, field.section].filter(Boolean).join(' '));
}

function scoreCandidate(field: FieldDescriptor, candidate: ProfileCandidate): number {
  const haystack = fieldHaystack(field);
  const normalizedLabel = normalizeText(field.label || field.placeholder || field.name);
  let score = 0;

  for (const alias of candidate.aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) continue;
    if (normalizedLabel === normalizedAlias) score = Math.max(score, 96);
    else if (normalizedLabel.includes(normalizedAlias)) score = Math.max(score, 84);
    else if (haystack.includes(normalizedAlias)) score = Math.max(score, 72);
  }

  if (candidate.repeatIndex !== undefined) {
    score += candidate.repeatIndex === field.occurrence ? 8 : -Math.min(12, Math.abs(candidate.repeatIndex - field.occurrence) * 5);
    if (haystack.includes(normalizeText(candidate.category))) score += 3;
  }

  if (field.type === 'email' && candidate.key === 'basics.email') score += 10;
  if (field.type === 'tel' && candidate.key === 'basics.phone') score += 10;
  if (field.type === 'url' && candidate.key.endsWith('.link')) score += 10;
  return Math.max(0, Math.min(100, score));
}

export function matchFields(fields: FieldDescriptor[], profile: ResumeProfile): FieldMatch[] {
  const candidates = profileCandidates(profile);
  const matches: FieldMatch[] = [];
  for (const field of fields) {
    if (field.currentValue) continue;
    const ranked = candidates
      .map((candidate) => ({ candidate, score: scoreCandidate(field, candidate) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 65) continue;
    matches.push({
      fieldId: field.id,
      profileKey: best.candidate.key,
      fieldLabel: field.label || field.placeholder || field.name || '未命名字段',
      profileLabel: best.candidate.label,
      value: best.candidate.value,
      confidence: best.score,
      source: 'rule',
      reason: best.score >= 90 ? '字段名称直接匹配' : '字段语义匹配',
    });
  }
  return matches;
}

export function resolveCandidate(profile: ResumeProfile, key: string): ProfileCandidate | undefined {
  return profileCandidates(profile).find((candidate) => candidate.key === key);
}
