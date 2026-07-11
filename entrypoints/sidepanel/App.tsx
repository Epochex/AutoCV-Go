import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { mapAmbiguousFields } from '../../lib/ai';
import {
  emptyCustomField,
  emptyEducation,
  emptyExperience,
  emptyOpenSource,
  emptyProject,
  emptyResearch,
} from '../../lib/defaults';
import { matchFields, profileCandidates } from '../../lib/matcher';
import {
  clearMappingMemory,
  getMappingMemoryStats,
  matchFieldsFromMemory,
  recordConfirmedMapping,
  undoLastMappingChange,
  type MappingMemoryStats,
} from '../../lib/memory';
import { loadProfile, loadSettings, saveProfile, saveSettings } from '../../lib/storage';
import ResumeImporter from './ResumeImporter';
import type {
  EducationEntry,
  ExperienceEntry,
  ExtensionSettings,
  FieldDescriptor,
  FieldMatch,
  FillResult,
  OpenSourceEntry,
  ProjectEntry,
  ResearchEntry,
  ResumeProfile,
  ScanResult,
} from '../../lib/types';

type View = 'fill' | 'profile' | 'settings';
type Notice = { tone: 'success' | 'warning' | 'error' | 'info'; text: string } | null;
type MatchApplyStatus = { tone: 'success' | 'warning' | 'error'; text: string };
type ManualFieldDraft = { profileKey: string; value: string };

const BASIC_FIELDS: Array<{
  key: keyof ResumeProfile['basics'];
  label: string;
  placeholder?: string;
  multiline?: boolean;
}> = [
  { key: 'fullName', label: '姓名' },
  { key: 'gender', label: '性别' },
  { key: 'birthDate', label: '出生日期', placeholder: '例如 2001-08-16' },
  { key: 'phone', label: '手机号' },
  { key: 'email', label: '邮箱' },
  { key: 'city', label: '所在城市' },
  { key: 'address', label: '联系地址' },
  { key: 'identityNumber', label: '身份证号' },
  { key: 'politicalStatus', label: '政治面貌' },
  { key: 'expectedRole', label: '期望职位' },
  { key: 'expectedCity', label: '期望城市' },
  { key: 'expectedSalary', label: '期望薪资' },
  { key: 'selfIntroduction', label: '自我介绍 / 自我评价', multiline: true },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <label className={`field ${multiline ? 'field--wide' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

function EntryCard({
  title,
  index,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="entry-card">
      <header>
        <div>
          <span className="entry-index">{String(index + 1).padStart(2, '0')}</span>
          <strong>{title}</strong>
        </div>
        <button className="icon-button" type="button" onClick={onRemove} aria-label={`删除${title}`}>
          删除
        </button>
      </header>
      <div className="field-grid">{children}</div>
    </article>
  );
}

function updateEntry<T extends { id: string }>(entries: T[], id: string, patch: Partial<T>): T[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
}

function EducationEditor({ profile, setProfile }: { profile: ResumeProfile; setProfile: (value: ResumeProfile) => void }) {
  const update = (id: string, patch: Partial<EducationEntry>) =>
    setProfile({ ...profile, education: updateEntry(profile.education, id, patch) });
  return (
    <ProfileSection title="教育经历" count={profile.education.length} onAdd={() => setProfile({ ...profile, education: [...profile.education, emptyEducation()] })}>
      {profile.education.map((entry, index) => (
        <EntryCard key={entry.id} title="教育经历" index={index} onRemove={() => setProfile({ ...profile, education: profile.education.filter((item) => item.id !== entry.id) })}>
          <Field label="学校" value={entry.school} onChange={(value) => update(entry.id, { school: value })} />
          <Field label="学历 / 学位" value={entry.degree} onChange={(value) => update(entry.id, { degree: value })} />
          <Field label="专业" value={entry.major} onChange={(value) => update(entry.id, { major: value })} />
          <Field label="GPA" value={entry.gpa} onChange={(value) => update(entry.id, { gpa: value })} />
          <Field label="开始时间" value={entry.startDate} onChange={(value) => update(entry.id, { startDate: value })} placeholder="YYYY-MM" />
          <Field label="结束时间" value={entry.endDate} onChange={(value) => update(entry.id, { endDate: value })} placeholder="YYYY-MM" />
          <Field label="专业排名" value={entry.ranking} onChange={(value) => update(entry.id, { ranking: value })} />
          <Field label="在校经历 / 主修课程" value={entry.description} onChange={(value) => update(entry.id, { description: value })} multiline />
        </EntryCard>
      ))}
    </ProfileSection>
  );
}

function ExperienceEditor({
  title,
  entries,
  onChange,
}: {
  title: string;
  entries: ExperienceEntry[];
  onChange: (entries: ExperienceEntry[]) => void;
}) {
  const update = (id: string, patch: Partial<ExperienceEntry>) => onChange(updateEntry(entries, id, patch));
  return (
    <ProfileSection title={title} count={entries.length} onAdd={() => onChange([...entries, emptyExperience()])}>
      {entries.map((entry, index) => (
        <EntryCard key={entry.id} title={title} index={index} onRemove={() => onChange(entries.filter((item) => item.id !== entry.id))}>
          <Field label="公司 / 单位" value={entry.organization} onChange={(value) => update(entry.id, { organization: value })} />
          <Field label="职位 / 岗位" value={entry.role} onChange={(value) => update(entry.id, { role: value })} />
          <Field label="开始时间" value={entry.startDate} onChange={(value) => update(entry.id, { startDate: value })} placeholder="YYYY-MM" />
          <Field label="结束时间" value={entry.endDate} onChange={(value) => update(entry.id, { endDate: value })} placeholder="YYYY-MM 或 至今" />
          <Field label="工作内容" value={entry.description} onChange={(value) => update(entry.id, { description: value })} multiline />
        </EntryCard>
      ))}
    </ProfileSection>
  );
}

function ProjectEditor({ profile, setProfile }: { profile: ResumeProfile; setProfile: (value: ResumeProfile) => void }) {
  const update = (id: string, patch: Partial<ProjectEntry>) =>
    setProfile({ ...profile, projects: updateEntry(profile.projects, id, patch) });
  return (
    <ProfileSection title="项目经历" count={profile.projects.length} onAdd={() => setProfile({ ...profile, projects: [...profile.projects, emptyProject()] })}>
      {profile.projects.map((entry, index) => (
        <EntryCard key={entry.id} title="项目经历" index={index} onRemove={() => setProfile({ ...profile, projects: profile.projects.filter((item) => item.id !== entry.id) })}>
          <Field label="项目名称" value={entry.name} onChange={(value) => update(entry.id, { name: value })} />
          <Field label="项目角色" value={entry.role} onChange={(value) => update(entry.id, { role: value })} />
          <Field label="开始时间" value={entry.startDate} onChange={(value) => update(entry.id, { startDate: value })} placeholder="YYYY-MM" />
          <Field label="结束时间" value={entry.endDate} onChange={(value) => update(entry.id, { endDate: value })} placeholder="YYYY-MM" />
          <Field label="项目链接" value={entry.link} onChange={(value) => update(entry.id, { link: value })} />
          <Field label="项目描述" value={entry.description} onChange={(value) => update(entry.id, { description: value })} multiline />
        </EntryCard>
      ))}
    </ProfileSection>
  );
}

function ResearchEditor({ profile, setProfile }: { profile: ResumeProfile; setProfile: (value: ResumeProfile) => void }) {
  const update = (id: string, patch: Partial<ResearchEntry>) =>
    setProfile({ ...profile, research: updateEntry(profile.research, id, patch) });
  return (
    <ProfileSection title="科研 / 论文" count={profile.research.length} onAdd={() => setProfile({ ...profile, research: [...profile.research, emptyResearch()] })}>
      {profile.research.map((entry, index) => (
        <EntryCard key={entry.id} title="科研 / 论文" index={index} onRemove={() => setProfile({ ...profile, research: profile.research.filter((item) => item.id !== entry.id) })}>
          <Field label="论文 / 研究名称" value={entry.name} onChange={(value) => update(entry.id, { name: value })} />
          <Field label="作者 / 研究角色" value={entry.role} onChange={(value) => update(entry.id, { role: value })} placeholder="例如：论文一作 / 系统实现" />
          <Field label="开始时间" value={entry.startDate} onChange={(value) => update(entry.id, { startDate: value })} placeholder="YYYY-MM" />
          <Field label="结束时间" value={entry.endDate} onChange={(value) => update(entry.id, { endDate: value })} placeholder="YYYY-MM 或 至今" />
          <Field label="论文 / 项目链接" value={entry.link} onChange={(value) => update(entry.id, { link: value })} />
          <Field label="研究内容 / 成果" value={entry.description} onChange={(value) => update(entry.id, { description: value })} multiline />
        </EntryCard>
      ))}
    </ProfileSection>
  );
}

function OpenSourceEditor({ profile, setProfile }: { profile: ResumeProfile; setProfile: (value: ResumeProfile) => void }) {
  const update = (id: string, patch: Partial<OpenSourceEntry>) =>
    setProfile({ ...profile, openSource: updateEntry(profile.openSource, id, patch) });
  return (
    <ProfileSection title="开源贡献" count={profile.openSource.length} onAdd={() => setProfile({ ...profile, openSource: [...profile.openSource, emptyOpenSource()] })}>
      {profile.openSource.map((entry, index) => (
        <EntryCard key={entry.id} title="开源贡献" index={index} onRemove={() => setProfile({ ...profile, openSource: profile.openSource.filter((item) => item.id !== entry.id) })}>
          <Field label="项目 / 仓库名称" value={entry.name} onChange={(value) => update(entry.id, { name: value })} />
          <Field label="贡献角色" value={entry.role} onChange={(value) => update(entry.id, { role: value })} placeholder="例如：Contributor / Maintainer" />
          <Field label="开始时间" value={entry.startDate} onChange={(value) => update(entry.id, { startDate: value })} placeholder="YYYY-MM" />
          <Field label="结束时间" value={entry.endDate} onChange={(value) => update(entry.id, { endDate: value })} placeholder="YYYY-MM 或 至今" />
          <Field label="仓库 / PR 链接" value={entry.link} onChange={(value) => update(entry.id, { link: value })} />
          <Field label="贡献内容" value={entry.description} onChange={(value) => update(entry.id, { description: value })} multiline />
        </EntryCard>
      ))}
    </ProfileSection>
  );
}

function ProfileSection({
  title,
  count,
  onAdd,
  children,
}: {
  title: string;
  count?: number;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="profile-section">
      <header className="section-heading">
        <div>
          <h2>{title}</h2>
          {count !== undefined && <span>{count} 条</span>}
        </div>
        {onAdd && (
          <button className="text-button" type="button" onClick={onAdd}>
            ＋ 添加
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<View>('fill');
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [matches, setMatches] = useState<FieldMatch[]>([]);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [matchApplyStatus, setMatchApplyStatus] = useState<Record<string, MatchApplyStatus>>({});
  const [manualFieldDrafts, setManualFieldDrafts] = useState<Record<string, ManualFieldDraft>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [memoryStats, setMemoryStats] = useState<MappingMemoryStats | null>(null);
  const [lastRun, setLastRun] = useState<{ at?: string; filled?: number; matched?: number } | null>(null);

  useEffect(() => {
    Promise.all([loadProfile(), loadSettings(), browser.storage.local.get('autocv.lastRun'), getMappingMemoryStats()]).then(
      ([loadedProfile, loadedSettings, report, loadedMemoryStats]) => {
        setProfile(loadedProfile);
        setSettings(loadedSettings);
        setLastRun((report['autocv.lastRun'] as typeof lastRun) ?? null);
        setMemoryStats(loadedMemoryStats);
      },
    );
  }, []);

  const matchedFieldIds = useMemo(() => new Set(matches.map((match) => match.fieldId)), [matches]);
  const unresolvedFields = useMemo(
    () =>
      (scan?.fields.filter((field) => !field.currentValue && !matchedFieldIds.has(field.id)) ?? [])
        .slice()
        .sort(
          (left, right) =>
            Number(right.required) - Number(left.required) ||
            Number(left.fillCapability === 'manual') - Number(right.fillCapability === 'manual'),
        ),
    [matchedFieldIds, scan],
  );
  const candidates = useMemo(() => (profile ? profileCandidates(profile) : []), [profile]);

  async function getActiveTabId(): Promise<number> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('无法获取当前网页标签');
    return tab.id;
  }

  async function rememberSuccessfulMappings(
    scanSnapshot: ScanResult | null,
    confirmedMatches: FieldMatch[],
    result: FillResult,
  ) {
    if (!settings?.rememberConfirmedMappings || !scanSnapshot || result.filledFieldIds.length === 0) return;
    try {
      const succeeded = new Set(result.filledFieldIds);
      const fieldsById = new Map(scanSnapshot.fields.map((field) => [field.id, field]));
      for (const match of confirmedMatches) {
        if (!succeeded.has(match.fieldId) || match.profileKey.startsWith('manual.')) continue;
        const field = fieldsById.get(match.fieldId);
        if (!field) continue;
        await recordConfirmedMapping({
          pageUrl: scanSnapshot.url,
          field,
          profileKey: match.profileKey,
          explicitConfirmation: true,
          fillSucceeded: true,
        });
      }
      setMemoryStats(await getMappingMemoryStats());
    } catch (error) {
      // Filling succeeded already. Memory is best-effort and must never turn a
      // successful page operation into a reported fill failure.
      console.warn('[AutoCV Go] 无法更新本地字段记忆', error);
    }
  }

  async function scanPage(fillAfterScan: boolean) {
    if (!profile || !settings) return;
    setBusy(true);
    setNotice({ tone: 'info', text: fillAfterScan ? '正在扫描并匹配字段…' : '正在扫描当前页面…' });
    setFillResult(null);
    setMatchApplyStatus({});
    setManualFieldDrafts({});
    try {
      const tabId = await getActiveTabId();
      const scanResult = (await browser.tabs.sendMessage(tabId, { type: 'AUTOCV_SCAN' })) as ScanResult;
      setScan(scanResult);
      const autoFillableFields = scanResult.fields.filter((field) => field.fillCapability === 'auto');
      const rememberedMatches = settings.rememberConfirmedMappings
        ? await matchFieldsFromMemory(autoFillableFields, profile, scanResult.url)
        : [];
      const rememberedFieldIds = new Set(rememberedMatches.map((match) => match.fieldId));
      const ruleMatches = matchFields(
        autoFillableFields.filter((field) => !rememberedFieldIds.has(field.id)),
        profile,
      );
      let aiMatches: FieldMatch[] = [];
      const unmatched = autoFillableFields.filter(
        (field) =>
          !field.currentValue &&
          !rememberedFieldIds.has(field.id) &&
          !ruleMatches.some((match) => match.fieldId === field.id),
      );

      if (
        settings.useAiForAmbiguousFields &&
        settings.ai.enabled &&
        settings.ai.apiKey &&
        unmatched.length > 0
      ) {
        try {
          aiMatches = await mapAmbiguousFields(unmatched.slice(0, 60), profile, settings.ai);
        } catch (error) {
          setNotice({ tone: 'warning', text: `规则匹配已完成，AI 兜底失败：${String(error)}` });
        }
      }

      const combined = [...rememberedMatches, ...ruleMatches, ...aiMatches].filter(
        (match, index, all) => all.findIndex((item) => item.fieldId === match.fieldId) === index,
      );
      setMatches(combined);

      if (fillAfterScan) {
        const safeMatches = combined.filter((match) => match.confidence >= 70);
        const result = (await browser.tabs.sendMessage(tabId, {
          type: 'AUTOCV_FILL',
          matches: safeMatches,
          overwrite: settings.overwriteExisting,
        })) as FillResult;
        setFillResult(result);
        await rememberSuccessfulMappings(scanResult, safeMatches, result);
        setNotice({
          tone: result.failed.length ? 'warning' : 'success',
          text: `已填写 ${result.filled} 项，跳过 ${result.skipped} 项${result.failed.length ? `，${result.failed.length} 项需手动处理` : ''}。不会自动提交。`,
        });
      } else {
        setNotice({ tone: 'success', text: `扫描到 ${scanResult.fields.length} 个字段，匹配 ${combined.length} 项。` });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: `无法操作当前页面：${error instanceof Error ? error.message : String(error)}。请刷新页面并确认扩展拥有站点权限。` });
    } finally {
      setBusy(false);
    }
  }

  function updateManualField(fieldId: string, patch: Partial<ManualFieldDraft>) {
    setManualFieldDrafts((current) => ({
      ...current,
      [fieldId]: { profileKey: '', value: '', ...current[fieldId], ...patch },
    }));
    setMatchApplyStatus((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  function selectManualCandidate(fieldId: string, profileKey: string) {
    const candidate = candidates.find((item) => item.key === profileKey);
    updateManualField(fieldId, { profileKey, value: candidate?.value ?? '' });
  }

  async function copyManualValue(fieldId: string) {
    const value = manualFieldDrafts[fieldId]?.value.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMatchApplyStatus((current) => ({
        ...current,
        [fieldId]: { tone: 'success', text: '已复制，可粘贴到暂不支持自动填写的控件。' },
      }));
    } catch (error) {
      setMatchApplyStatus((current) => ({
        ...current,
        [fieldId]: {
          tone: 'error',
          text: `复制失败：${error instanceof Error ? error.message : String(error)}`,
        },
      }));
    }
  }

  async function applyManualField(field: FieldDescriptor) {
    if (!settings || busy) return;
    if (field.fillCapability === 'manual') {
      setMatchApplyStatus((current) => ({
        ...current,
        [field.id]: { tone: 'warning', text: field.manualReason || '该控件需要复制后手动填写。' },
      }));
      return;
    }
    const draft = manualFieldDrafts[field.id];
    if (!draft?.value.trim()) {
      setMatchApplyStatus((current) => ({
        ...current,
        [field.id]: { tone: 'warning', text: '请先选择一条简历资料，或直接输入本次填写内容。' },
      }));
      return;
    }

    const candidate = candidates.find((item) => item.key === draft.profileKey);
    const manualMatch: FieldMatch = {
      fieldId: field.id,
      profileKey: candidate?.key ?? `manual.${field.id}`,
      fieldLabel: field.label || field.placeholder || field.name || '未命名字段',
      profileLabel: candidate?.label ?? '本次手动填写',
      value: draft.value,
      confidence: 100,
      source: 'rule',
      reason: '用户手动选择简历资料',
    };

    setBusy(true);
    setMatchApplyStatus((current) => {
      const next = { ...current };
      delete next[field.id];
      return next;
    });
    try {
      const tabId = await getActiveTabId();
      const result = (await browser.tabs.sendMessage(tabId, {
        type: 'AUTOCV_FILL',
        matches: [manualMatch],
        overwrite: settings.overwriteExisting,
      })) as FillResult;
      const failure = result.failed[0];
      if (failure) {
        setMatchApplyStatus((current) => ({
          ...current,
          [field.id]: { tone: 'error', text: failure.reason },
        }));
        return;
      }

      await rememberSuccessfulMappings(scan, [manualMatch], result);
      setMatches((current) => [
        ...current.filter((match) => match.fieldId !== field.id),
        manualMatch,
      ]);
      setMatchApplyStatus((current) => ({
        ...current,
        [field.id]: result.filled > 0
          ? { tone: 'success', text: '已应用到当前网页，可继续处理剩余字段。' }
          : { tone: 'warning', text: '网页字段已有内容，已跳过。' },
      }));
    } catch (error) {
      setMatchApplyStatus((current) => ({
        ...current,
        [field.id]: {
          tone: 'error',
          text: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setBusy(false);
    }
  }

  async function confirmManualField(field: FieldDescriptor) {
    if (!settings?.rememberConfirmedMappings || busy) return;
    const draft = manualFieldDrafts[field.id];
    if (!draft?.profileKey) {
      setMatchApplyStatus((current) => ({
        ...current,
        [field.id]: { tone: 'warning', text: '请先选择这项内容来自哪条简历资料。' },
      }));
      return;
    }

    setBusy(true);
    try {
      const tabId = await getActiveTabId();
      const refreshed = (await browser.tabs.sendMessage(tabId, { type: 'AUTOCV_SCAN' })) as ScanResult;
      const refreshedField = refreshed.fields.find((item) => item.id === field.id);
      if (!refreshedField?.currentValue.trim()) {
        setMatchApplyStatus((current) => ({
          ...current,
          [field.id]: { tone: 'warning', text: '还没有检测到网页中的已填内容，请先粘贴或完成选择。' },
        }));
        return;
      }

      const learned = await recordConfirmedMapping({
        pageUrl: refreshed.url,
        field: refreshedField,
        profileKey: draft.profileKey,
        explicitConfirmation: true,
        fillSucceeded: true,
      });
      if (!learned) throw new Error('该字段缺少可用于记忆的稳定特征');
      setScan(refreshed);
      setMemoryStats(await getMappingMemoryStats());
      setMatchApplyStatus((current) => ({
        ...current,
        [field.id]: { tone: 'success', text: '已检测到网页中的内容并记住这次对应关系。' },
      }));
      setNotice({ tone: 'success', text: '已确认手动填写并记住对应关系，可继续处理剩余字段。' });
    } catch (error) {
      setMatchApplyStatus((current) => ({
        ...current,
        [field.id]: {
          tone: 'error',
          text: `无法确认记忆：${error instanceof Error ? error.message : String(error)}`,
        },
      }));
    } finally {
      setBusy(false);
    }
  }

  function updateMatchValue(fieldId: string, value: string) {
    setMatches((current) =>
      current.map((match) => (match.fieldId === fieldId ? { ...match, value } : match)),
    );
    setMatchApplyStatus((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  async function applySingleMatch(match: FieldMatch) {
    if (!settings || busy) return;
    if (!match.value.trim()) {
      setMatchApplyStatus((current) => ({
        ...current,
        [match.fieldId]: { tone: 'warning', text: '拟填内容为空，未应用。' },
      }));
      return;
    }

    setBusy(true);
    setMatchApplyStatus((current) => {
      const next = { ...current };
      delete next[match.fieldId];
      return next;
    });
    try {
      const tabId = await getActiveTabId();
      const result = (await browser.tabs.sendMessage(tabId, {
        type: 'AUTOCV_FILL',
        matches: [match],
        overwrite: settings.overwriteExisting,
      })) as FillResult;

      await rememberSuccessfulMappings(scan, [match], result);

      const status: MatchApplyStatus = result.failed[0]
        ? { tone: 'error', text: result.failed[0].reason }
        : result.filled > 0
          ? { tone: 'success', text: '已应用到当前网页。' }
          : { tone: 'warning', text: '字段已有内容，已跳过。' };
      setMatchApplyStatus((current) => ({ ...current, [match.fieldId]: status }));
    } catch (error) {
      setMatchApplyStatus((current) => ({
        ...current,
        [match.fieldId]: {
          tone: 'error',
          text: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setBusy(false);
    }
  }

  async function applyAllMatches() {
    if (!settings || busy) return;
    const applicableMatches = matches.filter((match) => match.value.trim());
    if (applicableMatches.length === 0) {
      setNotice({ tone: 'warning', text: '当前匹配项没有可应用的内容。' });
      return;
    }

    setBusy(true);
    setFillResult(null);
    setMatchApplyStatus({});
    try {
      const tabId = await getActiveTabId();
      const result = (await browser.tabs.sendMessage(tabId, {
        type: 'AUTOCV_FILL',
        matches: applicableMatches,
        overwrite: settings.overwriteExisting,
      })) as FillResult;
      setFillResult(result);
      await rememberSuccessfulMappings(scan, applicableMatches, result);

      const failedByField = new Map(result.failed.map((failure) => [failure.fieldId, failure.reason]));
      const skippedFields = new Set(result.skippedFieldIds);
      setMatchApplyStatus(
        Object.fromEntries(
          applicableMatches.map((match) => {
            const failure = failedByField.get(match.fieldId);
            return [
              match.fieldId,
              failure
                ? { tone: 'error', text: failure }
                : skippedFields.has(match.fieldId)
                  ? { tone: 'warning', text: '网页字段已有内容，已跳过。' }
                  : { tone: 'success', text: '已应用到当前网页。' },
            ];
          }),
        ),
      );
      setNotice({
        tone: result.failed.length ? 'warning' : 'success',
        text: `批量应用完成：填写 ${result.filled} 项，跳过 ${result.skipped} 项${result.failed.length ? `，失败 ${result.failed.length} 项` : ''}。不会自动提交。`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: `批量应用失败：${error instanceof Error ? error.message : String(error)}。`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function persistProfile() {
    if (!profile) return;
    await saveProfile(profile);
    setNotice({ tone: 'success', text: '简历资料已保存在本机浏览器。' });
  }

  async function persistSettings() {
    if (!settings) return;
    await saveSettings(settings);
    setNotice({ tone: 'success', text: '自动填充和 API 设置已保存。' });
  }

  async function setAutoFillMode(autoFillJobPages: boolean) {
    if (!settings) return;
    const next = { ...settings, autoFillJobPages };
    setSettings(next);
    await saveSettings(next);
    setNotice({
      tone: 'success',
      text: autoFillJobPages
        ? '已开启后台自动填写。刷新招聘页面后会自动处理高置信度空字段。'
        : '已关闭后台自动填写，仍可使用扫描按钮手动触发。',
    });
  }

  async function undoMemoryChange() {
    const restored = await undoLastMappingChange();
    setMemoryStats(await getMappingMemoryStats());
    setNotice({
      tone: restored ? 'success' : 'info',
      text: restored ? '已撤销最近一次字段记忆更新。' : '当前没有可撤销的字段记忆。',
    });
  }

  async function clearMemory() {
    if (!window.confirm('清空全部本地字段映射记忆？已保存的简历资料不会受影响。')) return;
    await clearMappingMemory();
    setMemoryStats(await getMappingMemoryStats());
    setNotice({ tone: 'success', text: '本地字段映射记忆已清空。' });
  }

  if (!profile || !settings) {
    return <div className="loading">正在打开本地简历工作台…</div>;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">AF</div>
        <div>
          <h1>AutoCV Go</h1>
          <p>合格的快枪手就特么的需要快速装填！</p>
        </div>
        <span className="privacy-chip">不自动提交</span>
      </header>

      <nav className="view-tabs" aria-label="主要功能">
        <button className={view === 'fill' ? 'active' : ''} onClick={() => setView('fill')}>扫描填充</button>
        <button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>简历资料</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>设置</button>
      </nav>

      {notice && <div className={`notice notice--${notice.tone}`}>{notice.text}</div>}

      <main>
        {view === 'fill' && (
          <div className="view-stack">
            <section className="hero-panel">
              <span className="eyebrow">当前网页</span>
              <h2>{scan?.title || '准备扫描网申表单'}</h2>
              <p>{scan ? `${scan.fields.length} 个可填写字段 · ${scan.likelyJobPage ? '已识别为网申页面' : '未确认是否为网申页面'}` : '保存简历后，在招聘页面点击一次即可完成扫描和填写。'}</p>
              <button className="primary-button" type="button" disabled={busy} onClick={() => void scanPage(true)}>
                {busy ? '正在处理…' : '扫描并填写空字段'}
              </button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void scanPage(false)}>
                仅扫描，先看匹配结果
              </button>
              <div className={`auto-mode-control ${settings.autoFillJobPages ? 'is-on' : ''}`}>
                <div>
                  <strong>后台自动填写</strong>
                  <span>{settings.autoFillJobPages ? '已开启，刷新页面自动装填' : '当前关闭，只会手动扫描'}</span>
                </div>
                <button
                  type="button"
                  aria-pressed={settings.autoFillJobPages}
                  onClick={() => void setAutoFillMode(!settings.autoFillJobPages)}
                >
                  {settings.autoFillJobPages ? '关闭' : '立即开启'}
                </button>
              </div>
            </section>

            {lastRun?.at && (
              <section className="last-run">
                <span>自动填充记录</span>
                <strong>{lastRun.filled ?? 0} 项已填写</strong>
                <small>{new Date(lastRun.at).toLocaleString('zh-CN')}</small>
              </section>
            )}

            {scan && (
              <section className="match-panel">
                <header className="section-heading">
                  <div>
                    <h2>匹配预览</h2>
                    <span>{matches.length} 已匹配 · {unresolvedFields.length} 待确认</span>
                  </div>
                  {matches.length > 0 && (
                    <button
                      className="apply-all-button"
                      type="button"
                      disabled={busy || matches.every((match) => !match.value.trim())}
                      onClick={() => void applyAllMatches()}
                    >
                      {busy ? '正在应用…' : '应用全部匹配'}
                    </button>
                  )}
                </header>
                <div className="match-list">
                  {matches.length === 0 && (
                    <p className="empty-state">
                      {unresolvedFields.length > 0
                        ? '没有自动匹配项，请在下方逐项选择已有简历资料。'
                        : '当前页面没有尚未填写的字段。'}
                    </p>
                  )}
                  {matches.map((match) => {
                    const applyStatus = matchApplyStatus[match.fieldId];
                    return (
                    <article className="match-row" key={match.fieldId}>
                      <div className="confidence-rail" style={{ '--confidence': `${match.confidence}%` } as React.CSSProperties} />
                      <div className="match-content">
                        <div className="match-heading">
                          <div>
                            <strong>{match.fieldLabel}</strong>
                            <span>来源：{match.profileLabel}</span>
                          </div>
                          <div className="confidence-capsule">
                            {match.reason === '用户手动选择简历资料'
                              ? '手动'
                              : match.source === 'memory'
                                ? '记忆'
                                : match.source === 'ai'
                                  ? 'AI'
                                  : '规则'} {match.confidence}
                          </div>
                        </div>
                        <label className="match-value-field">
                          <span>即将填充的内容</span>
                          <textarea
                            value={match.value}
                            rows={match.value.length > 80 || match.value.includes('\n') ? 4 : 2}
                            onChange={(event) => updateMatchValue(match.fieldId, event.target.value)}
                            aria-describedby={`match-help-${match.fieldId}`}
                          />
                        </label>
                        <div className="match-footer">
                          <small id={`match-help-${match.fieldId}`}>{match.reason} · 编辑仅影响本次填写</small>
                          <button
                            className="apply-one-button"
                            type="button"
                            disabled={busy || !match.value.trim()}
                            onClick={() => void applySingleMatch(match)}
                            aria-label={`应用到网页字段：${match.fieldLabel}`}
                          >
                            应用此项
                          </button>
                        </div>
                        {applyStatus && (
                          <p
                            className={`match-status match-status--${applyStatus.tone}`}
                            role="status"
                            aria-live="polite"
                          >
                            {applyStatus.text}
                          </p>
                        )}
                      </div>
                    </article>
                    );
                  })}
                </div>

                {unresolvedFields.length > 0 && (
                  <section className="unresolved-workbench" aria-labelledby="unresolved-heading">
                    <header>
                      <div>
                        <span className="eyebrow">下一步</span>
                        <h3 id="unresolved-heading">逐项确认剩余字段</h3>
                      </div>
                      <strong>{unresolvedFields.length} 项</strong>
                    </header>
                    <p className="unresolved-guide">
                      扫描已列出网页中的全部空字段。自动匹配不到时，可从本地简历资料中选择、编辑后应用；复杂控件可复制后手动粘贴。
                    </p>
                    <div className="unresolved-list">
                      {unresolvedFields.map((field, index) => {
                        const draft = manualFieldDrafts[field.id] ?? { profileKey: '', value: '' };
                        const applyStatus = matchApplyStatus[field.id];
                        const fieldName = field.label || field.placeholder || field.name || `未命名字段 ${index + 1}`;
                        const canRememberManual =
                          settings?.rememberConfirmedMappings &&
                          field.fillCapability === 'manual' &&
                          !['file', 'password'].includes(field.type);
                        return (
                          <article className="unresolved-row" key={field.id}>
                            <div className="unresolved-heading">
                              <div>
                                <span className="unresolved-index">{String(index + 1).padStart(2, '0')}</span>
                                <strong>{fieldName}</strong>
                                {field.required && <span className="required-badge">必填</span>}
                                {field.fillCapability === 'manual' && <span className="manual-badge">需手动</span>}
                              </div>
                              <span>{field.type || field.tag}</span>
                            </div>
                            {(field.section || field.manualReason) && (
                              <p className="field-context">
                                {[field.section && `所在区域：${field.section}`, field.manualReason].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            <label className="candidate-select-field">
                              <span>从已有简历资料选择</span>
                              <select
                                value={draft.profileKey}
                                onChange={(event) => selectManualCandidate(field.id, event.target.value)}
                              >
                                <option value="">请选择资料（也可直接在下方输入）</option>
                                {candidates.map((candidate) => (
                                  <option key={candidate.key} value={candidate.key}>
                                    {candidate.label} · {candidate.value.replace(/\s+/g, ' ').slice(0, 48)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="match-value-field">
                              <span>本次填写内容</span>
                              <textarea
                                value={draft.value}
                                rows={draft.value.length > 80 || draft.value.includes('\n') ? 4 : 2}
                                placeholder="选择已有资料，或为本次网申直接输入内容"
                                onChange={(event) => updateManualField(field.id, { value: event.target.value })}
                                aria-describedby={`manual-help-${field.id}`}
                              />
                            </label>
                            <div className="unresolved-actions">
                              <small id={`manual-help-${field.id}`}>
                                {field.fillCapability === 'manual'
                                  ? canRememberManual
                                    ? '复制并在网页完成填写后，可检查页面并记住对应关系。'
                                    : '此敏感或文件控件不会自动填写，也不会保存映射。'
                                  : '编辑只影响本次填写，不会改动已保存的简历。'}
                              </small>
                              <div>
                                <button
                                  className="copy-value-button"
                                  type="button"
                                  disabled={!draft.value.trim()}
                                  onClick={() => void copyManualValue(field.id)}
                                >
                                  复制内容
                                </button>
                                <button
                                  className="apply-one-button"
                                  type="button"
                                  disabled={
                                    busy ||
                                    !draft.value.trim() ||
                                    (field.fillCapability === 'manual' && (!canRememberManual || !draft.profileKey))
                                  }
                                  onClick={() =>
                                    void (field.fillCapability === 'manual'
                                      ? confirmManualField(field)
                                      : applyManualField(field))
                                  }
                                >
                                  {field.fillCapability === 'manual'
                                    ? canRememberManual
                                      ? '检查并记住'
                                      : '请手动完成'
                                    : '应用此项'}
                                </button>
                              </div>
                            </div>
                            {applyStatus && (
                              <p
                                className={`match-status match-status--${applyStatus.tone}`}
                                role="status"
                                aria-live="polite"
                              >
                                {applyStatus.text}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </section>
            )}

            {fillResult?.failed.length ? (
              <section className="manual-panel">
                <h2>需要手动处理</h2>
                {fillResult.failed.map((failure) => <p key={failure.fieldId}>{failure.reason}</p>)}
              </section>
            ) : null}
          </div>
        )}

        {view === 'profile' && (
          <div className="view-stack profile-view">
            <section className="profile-intro">
              <span className="eyebrow">本地资料库</span>
              <h2>只维护一次，后续按字段复用</h2>
              <p>内容保存在浏览器本地。表单 AI 映射不发送具体值；使用 AI 导入简历时会单独提示并发送提取出的全文。</p>
            </section>

            <ResumeImporter
              profile={profile}
              settings={settings}
              onApply={(nextProfile, sourceName) => {
                setProfile(nextProfile);
                setNotice({ tone: 'success', text: `已把 ${sourceName} 的解析结果应用到编辑器，请核对后保存。` });
              }}
            />

            <ProfileSection title="基本信息">
              <div className="field-grid">
                {BASIC_FIELDS.map((field) => (
                  <Field
                    key={field.key}
                    label={field.label}
                    value={profile.basics[field.key]}
                    placeholder={field.placeholder}
                    multiline={field.multiline}
                    onChange={(value) => setProfile({ ...profile, basics: { ...profile.basics, [field.key]: value } })}
                  />
                ))}
              </div>
            </ProfileSection>

            <EducationEditor profile={profile} setProfile={setProfile} />
            <ExperienceEditor title="工作经历" entries={profile.work} onChange={(work) => setProfile({ ...profile, work })} />
            <ExperienceEditor title="实习经历" entries={profile.internship} onChange={(internship) => setProfile({ ...profile, internship })} />
            <ProjectEditor profile={profile} setProfile={setProfile} />
            <ResearchEditor profile={profile} setProfile={setProfile} />
            <OpenSourceEditor profile={profile} setProfile={setProfile} />

            <ProfileSection title="能力与荣誉">
              <div className="field-grid">
                <Field label="专业技能" value={profile.skills} onChange={(skills) => setProfile({ ...profile, skills })} multiline />
                <Field label="语言能力" value={profile.languages} onChange={(languages) => setProfile({ ...profile, languages })} multiline />
                <Field label="获奖经历" value={profile.awards} onChange={(awards) => setProfile({ ...profile, awards })} multiline />
              </div>
            </ProfileSection>

            <ProfileSection title="自定义内容" count={profile.customFields.length} onAdd={() => setProfile({ ...profile, customFields: [...profile.customFields, emptyCustomField()] })}>
              {profile.customFields.map((entry, index) => (
                <EntryCard key={entry.id} title="自定义字段" index={index} onRemove={() => setProfile({ ...profile, customFields: profile.customFields.filter((item) => item.id !== entry.id) })}>
                  <Field label="字段名称" value={entry.label} onChange={(value) => setProfile({ ...profile, customFields: updateEntry(profile.customFields, entry.id, { label: value }) })} placeholder="例如：是否接受调剂" />
                  <Field label="别名" value={entry.aliases} onChange={(value) => setProfile({ ...profile, customFields: updateEntry(profile.customFields, entry.id, { aliases: value }) })} placeholder="用逗号分隔" />
                  <Field label="填写内容" value={entry.value} onChange={(value) => setProfile({ ...profile, customFields: updateEntry(profile.customFields, entry.id, { value }) })} multiline />
                </EntryCard>
              ))}
            </ProfileSection>

            <div className="sticky-save">
              <button className="primary-button" type="button" onClick={() => void persistProfile()}>保存简历资料</button>
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="view-stack settings-view">
            <section className="settings-card">
              <span className="eyebrow">自动化</span>
              <Toggle label="进入疑似网申页面后自动填写（默认关闭；启用后网页可读取已写入表单的资料）" checked={settings.autoFillJobPages} onChange={(autoFillJobPages) => setSettings({ ...settings, autoFillJobPages })} dangerous />
              <Toggle label="允许 AI 处理规则无法判断的字段" checked={settings.useAiForAmbiguousFields} onChange={(useAiForAmbiguousFields) => setSettings({ ...settings, useAiForAmbiguousFields })} />
              <Toggle label="记住我确认并成功填写的字段映射（仅保存在本机）" checked={settings.rememberConfirmedMappings} onChange={(rememberConfirmedMappings) => setSettings({ ...settings, rememberConfirmedMappings })} />
              <Toggle label="允许覆盖网页中已有内容" checked={settings.overwriteExisting} onChange={(overwriteExisting) => setSettings({ ...settings, overwriteExisting })} dangerous />
            </section>

            <section className="settings-card memory-settings">
              <span className="eyebrow">本地映射记忆</span>
              <h2>越确认，后续匹配越稳定</h2>
              <p>只记录网站域名、字段特征摘要和资料字段键，不保存网页路径、字段原文或填写内容。仅成功应用的确认会被学习。</p>
              <div className="memory-stats" aria-live="polite">
                <span><strong>{memoryStats?.mappings ?? 0}</strong> 条映射</span>
                <span><strong>{memoryStats?.sites ?? 0}</strong> 个网站</span>
                <span><strong>{memoryStats?.confirmations ?? 0}</strong> 次确认</span>
              </div>
              <div className="memory-actions">
                <button className="copy-value-button" type="button" onClick={() => void undoMemoryChange()}>
                  撤销最近一次
                </button>
                <button className="memory-clear-button" type="button" disabled={!memoryStats?.mappings} onClick={() => void clearMemory()}>
                  清空记忆
                </button>
              </div>
            </section>

            <section className="settings-card">
              <span className="eyebrow">OpenAI 兼容 API</span>
              <h2>使用你自己的模型服务</h2>
              <p>网页字段映射只发送字段名称和资料结构，不发送具体值；仅当你在文件导入区主动开启 AI 解析时，才会发送提取出的简历全文。</p>
              <Toggle label="启用 API 兜底" checked={settings.ai.enabled} onChange={(enabled) => setSettings({ ...settings, ai: { ...settings.ai, enabled } })} />
              <div className="field-grid">
                <Field label="接口地址" value={settings.ai.endpoint} onChange={(endpoint) => setSettings({ ...settings, ai: { ...settings.ai, endpoint } })} />
                <Field label="模型" value={settings.ai.model} onChange={(model) => setSettings({ ...settings, ai: { ...settings.ai, model } })} placeholder="deepseek-chat" />
                <Field label="API Key" type="password" value={settings.ai.apiKey} onChange={(apiKey) => setSettings({ ...settings, ai: { ...settings.ai, apiKey } })} />
              </div>
            </section>

            <section className="safety-note">
              <strong>边界</strong>
              <p>扩展不会点击提交、投递、确认支付等按钮；文件上传、验证码和无法可靠识别的复杂下拉框会留给你处理。</p>
            </section>

            <div className="sticky-save">
              <button className="primary-button" type="button" onClick={() => void persistSettings()}>保存设置</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Toggle({ label, checked, onChange, dangerous }: { label: string; checked: boolean; onChange: (checked: boolean) => void; dangerous?: boolean }) {
  return (
    <label className={`toggle-row ${dangerous ? 'toggle-row--danger' : ''}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
