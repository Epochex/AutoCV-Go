import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from './defaults';
import { mergeParsedProfile, normalizeResumeText, parseResumeText } from './resume-import';

describe('parseResumeText', () => {
  it('parses a Chinese Markdown resume into structured profile fields', () => {
    const markdown = `
# 张三

电话：138-0013-8000 | 邮箱：zhangsan@example.com
现居：杭州 | 意向城市：上海
求职意愿：后端开发工程师

## 教育经历

### 浙江大学 | 计算机科学与技术 | 硕士
2022.09 - 2025.06
- GPA：3.8/4.0，排名：前 10%

## 实习经历

### 示例科技有限公司 | 后端开发实习生
2024.03 - 2024.09
- 使用 TypeScript 建设招聘平台。

## 项目经历

### 智能网申助手 | 核心开发
2024.10 - 至今
- 自动识别并填写中文表单。
- https://github.com/example/autocv

## 技能
- TypeScript、React、Python

## 语言能力
- 英语 CET-6

## 荣誉奖项
- 国家奖学金
`;

    const parsed = parseResumeText(markdown, 'md');

    expect(parsed.basics).toMatchObject({
      fullName: '张三',
      phone: '13800138000',
      email: 'zhangsan@example.com',
      city: '杭州',
      expectedCity: '上海',
      expectedRole: '后端开发工程师',
    });
    expect(parsed.education).toHaveLength(1);
    expect(parsed.education?.[0]).toMatchObject({
      school: '浙江大学',
      degree: '硕士',
      major: '计算机科学与技术',
      startDate: '2022-09',
      endDate: '2025-06',
      gpa: '3.8/4.0',
    });
    expect(parsed.internship?.[0]).toMatchObject({
      organization: '示例科技有限公司',
      role: '后端开发实习生',
      startDate: '2024-03',
      endDate: '2024-09',
    });
    expect(parsed.projects?.[0]).toMatchObject({
      name: '智能网申助手',
      role: '核心开发',
      startDate: '2024-10',
      endDate: '至今',
      link: 'https://github.com/example/autocv',
    });
    expect(parsed.skills).toContain('TypeScript');
    expect(parsed.languages).toContain('CET-6');
    expect(parsed.awards).toContain('国家奖学金');
  });

  it('understands nested projects in a custom LaTeX resume template', () => {
    const latex = String.raw`
\documentclass{article}
\newcommand{\sectionblock}[1]{ignored definition}
\begin{document}
{\fontsize{20.5}{22.5}\selectfont\bfseries 李雷}\\
求职意愿：AI Agent 工程师 / 大模型应用后端开发\\
邮箱：lilei@example.com\\
现居杭州，意向上海

\sectionblock{教育背景}
\datedentry{示例大学 | 示例研究所}
{2024.09 -- 2027.06}{网络与系统工程 - 硕士}

\sectionblock{项目与实习经历}
\datedentry{示例科技有限公司}{2025.08 -- 2026.10}
{工程与平台自动化开发 - 实习}
\begin{itemize}
  \resitem{\project{自演化定价工作流平台}{构建\textbf{级联意图路由}，支持自动执行。}}
  \resitem{\project{多 Agent 态势感知系统}{构建可回放的长周期记忆。}}
\end{itemize}
\datedentry{示例网络科技有限公司}{2024.04 -- 2024.09}
{网络工程师 - 实习}
\begin{itemize}
  \resitem{\project{生产自动化控制面}{将设备配置抽象为可重复任务。}}
\end{itemize}

\sectionblock{科研经历}
\datedentry{面向 LLM 的证据准入研究}{2026.04 -- 2026.10}
{论文一作 | 架构设计 + 系统实现}
\end{document}`;

    const normalized = normalizeResumeText(latex, 'tex');
    expect(normalized).toContain('@@SECTION\t教育背景');
    expect(normalized).toContain('@@ENTRY\t示例大学');
    expect(normalized).toContain('@@PROJECT\t自演化定价工作流平台');

    const parsed = parseResumeText(latex, 'tex');
    expect(parsed.basics).toMatchObject({
      fullName: '李雷',
      email: 'lilei@example.com',
      expectedRole: 'AI Agent 工程师 / 大模型应用后端开发',
      city: '杭州',
      expectedCity: '上海',
    });
    expect(parsed.education?.[0]).toMatchObject({
      school: '示例大学',
      degree: '硕士',
      major: '网络与系统工程',
      startDate: '2024-09',
      endDate: '2027-06',
    });
    expect(parsed.internship?.[0]).toMatchObject({
      organization: '示例科技有限公司',
      startDate: '2025-08',
      endDate: '2026-10',
    });
    const projectsByName = new Map(parsed.projects?.map((project) => [project.name, project]));
    expect(projectsByName.get('自演化定价工作流平台')).toMatchObject({
      role: '工程与平台自动化开发 - 实习',
      startDate: '2025-08',
      endDate: '2026-10',
    });
    expect(projectsByName.get('多 Agent 态势感知系统')).toMatchObject({
      role: '工程与平台自动化开发 - 实习',
      startDate: '2025-08',
      endDate: '2026-10',
    });
    expect(projectsByName.get('生产自动化控制面')).toMatchObject({
      role: '网络工程师 - 实习',
      startDate: '2024-04',
      endDate: '2024-09',
    });
    expect(projectsByName.has('面向 LLM 的证据准入研究')).toBe(true);
  });

  it('merges only detected values and supports replace or append for repeated sections', () => {
    const current = structuredClone(DEFAULT_PROFILE);
    current.basics.fullName = '旧姓名';
    current.basics.phone = '13900000000';
    current.skills = '旧技能';
    current.education[0]!.school = '旧学校';
    current.customFields = [{ id: 'existing-portfolio', label: '作品集', value: '用户保存的链接', aliases: '主页' }];
    const parsed = parseResumeText(`
# 新姓名
邮箱：new@example.com
## 教育经历
新大学 | 软件工程 | 本科 | 2020.09 - 2024.06
`, 'markdown');
    parsed.customFields = [
      { id: 'imported-portfolio', label: '作品集', value: '导入文件中的链接', aliases: '' },
      { id: 'imported-wechat', label: '微信', value: 'example-id', aliases: '' },
    ];

    const replaced = mergeParsedProfile(current, parsed);
    expect(replaced.basics).toMatchObject({
      fullName: '新姓名',
      phone: '13900000000',
      email: 'new@example.com',
    });
    expect(replaced.skills).toBe('旧技能');
    expect(replaced.education).toHaveLength(1);
    expect(replaced.education[0]?.school).toBe('新大学');
    expect(replaced.customFields).toEqual([
      { id: 'existing-portfolio', label: '作品集', value: '用户保存的链接', aliases: '主页' },
      { id: 'imported-wechat', label: '微信', value: 'example-id', aliases: '' },
    ]);

    const appended = mergeParsedProfile(current, parsed, { arrayMode: 'append' });
    expect(appended.education.map((entry) => entry.school)).toEqual(['旧学校', '新大学']);
    appended.education[1]!.description = '用户补充且需要保留的说明';
    const reparsed = structuredClone(parsed);
    reparsed.education![0]!.description = '解析器生成的不同说明';
    const appendedAgain = mergeParsedProfile(appended, reparsed, { arrayMode: 'append' });
    expect(appendedAgain.education.map((entry) => entry.school)).toEqual(['旧学校', '新大学']);
    expect(appendedAgain.education[1]?.description).toBe('用户补充且需要保留的说明');
    expect(current.basics.fullName).toBe('旧姓名');
  });

  it('extracts first-level bullet projects nested under plain-text internship entries', () => {
    const parsed = parseResumeText(`
项目与实习经历
示例科技有限公司 2025.08 - 2026.10
工程与平台自动化开发 - 实习
• 自演化定价工作流平台：以企业 IM 为入口构建级联意图路由。
– 自扩展技能库与过程级验证：候选须经回放验证才入库。
– 规模与成效：覆盖 320 条产品线并自动生成价格。
• 多 Agent 态势感知系统：按证据歧义升级多 Agent 协同。
示例网络科技有限公司 2024.04 - 2024.09
网络工程师 - 实习
• 生产自动化控制面：将硬件配置抽象为可重复任务单元。
`, 'pdf');

    expect(parsed.internship).toHaveLength(2);
    expect(parsed.internship?.[0]).toMatchObject({
      organization: '示例科技有限公司',
      role: '工程与平台自动化开发 - 实习',
      startDate: '2025-08',
      endDate: '2026-10',
    });
    expect(parsed.internship?.[0]?.description).toContain('自演化定价工作流平台');
    expect(parsed.internship?.[1]).toMatchObject({
      organization: '示例网络科技有限公司',
      role: '网络工程师 - 实习',
    });
    expect(parsed.projects?.map((project) => project.name)).toEqual([
      '自演化定价工作流平台',
      '多 Agent 态势感知系统',
      '生产自动化控制面',
    ]);
    expect(parsed.projects?.[0]).toMatchObject({
      role: '工程与平台自动化开发 - 实习',
      startDate: '2025-08',
      endDate: '2026-10',
    });
    expect(parsed.projects?.[1]?.role).toBe('工程与平台自动化开发 - 实习');
  });

  it('does not leak internal bullet markers into PDF research projects', () => {
    const parsed = parseResumeText(`
教育背景
示例大学 | 示例研究所 2024.09 – 2027.06
网络与系统工程 - 硕士

科研经历
面向 LLM 的证据准入研究 2026.04 – 2026.10
论文一作 | 架构设计 + 系统实现
• 联合实验室构建证据准入层。
`, 'pdf');

    expect(parsed.education?.[0]).toMatchObject({
      school: '示例大学',
      degree: '硕士',
      major: '网络与系统工程',
    });
    expect(parsed.projects?.[0]).toMatchObject({
      name: '面向 LLM 的证据准入研究',
      role: '论文一作 | 架构设计 + 系统实现',
      startDate: '2026-04',
      endDate: '2026-10',
    });
    expect(parsed.projects?.[0]?.description).toContain('联合实验室构建证据准入层');
    expect(parsed.projects?.[0]?.description).not.toContain('@@BULLET');
  });
});
