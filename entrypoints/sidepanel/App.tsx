import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { mapAmbiguousFields } from '../../lib/ai';
import {
  emptyCustomField,
  emptyEducation,
  emptyExperience,
  emptyProject,
} from '../../lib/defaults';
import { matchFields } from '../../lib/matcher';
import { loadProfile, loadSettings, saveProfile, saveSettings } from '../../lib/storage';
import type {
  EducationEntry,
  ExperienceEntry,
  ExtensionSettings,
  FieldMatch,
  FillResult,
  ProjectEntry,
  ResumeProfile,
  ScanResult,
} from '../../lib/types';

type View = 'fill' | 'profile' | 'settings';
type Notice = { tone: 'success' | 'warning' | 'error' | 'info'; text: string } | null;

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
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<{ at?: string; filled?: number; matched?: number; url?: string } | null>(null);

  useEffect(() => {
    Promise.all([loadProfile(), loadSettings(), browser.storage.local.get('autocv.lastRun')]).then(
      ([loadedProfile, loadedSettings, report]) => {
        setProfile(loadedProfile);
        setSettings(loadedSettings);
        setLastRun((report['autocv.lastRun'] as typeof lastRun) ?? null);
      },
    );
  }, []);

  const matchedFieldIds = useMemo(() => new Set(matches.map((match) => match.fieldId)), [matches]);
  const unresolvedCount = scan ? scan.fields.filter((field) => !field.currentValue && !matchedFieldIds.has(field.id)).length : 0;

  async function getActiveTabId(): Promise<number> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('无法获取当前网页标签');
    return tab.id;
  }

  async function scanPage(fillAfterScan: boolean) {
    if (!profile || !settings) return;
    setBusy(true);
    setNotice({ tone: 'info', text: fillAfterScan ? '正在扫描并匹配字段…' : '正在扫描当前页面…' });
    setFillResult(null);
    try {
      const tabId = await getActiveTabId();
      const scanResult = (await browser.tabs.sendMessage(tabId, { type: 'APPLYFLOW_SCAN' })) as ScanResult;
      setScan(scanResult);
      const ruleMatches = matchFields(scanResult.fields, profile);
      let aiMatches: FieldMatch[] = [];
      const unmatched = scanResult.fields.filter(
        (field) => !field.currentValue && !ruleMatches.some((match) => match.fieldId === field.id),
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

      const combined = [...ruleMatches, ...aiMatches].filter(
        (match, index, all) => all.findIndex((item) => item.fieldId === match.fieldId) === index,
      );
      setMatches(combined);

      if (fillAfterScan) {
        const safeMatches = combined.filter((match) => match.confidence >= 70);
        const result = (await browser.tabs.sendMessage(tabId, {
          type: 'APPLYFLOW_FILL',
          matches: safeMatches,
          overwrite: settings.overwriteExisting,
        })) as FillResult;
        setFillResult(result);
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

  if (!profile || !settings) {
    return <div className="loading">正在打开本地简历工作台…</div>;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">AF</div>
        <div>
          <h1>AutoCV Go</h1>
          <p>网申填充助手 · 本地优先</p>
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
                    <span>{matches.length} 已匹配 · {unresolvedCount} 待确认</span>
                  </div>
                </header>
                <div className="match-list">
                  {matches.length === 0 && <p className="empty-state">没有匹配到可填写的空字段。请先补充简历资料或检查网页权限。</p>}
                  {matches.map((match) => (
                    <article className="match-row" key={match.fieldId}>
                      <div className="confidence-rail" style={{ '--confidence': `${match.confidence}%` } as React.CSSProperties} />
                      <div>
                        <strong>{match.fieldLabel}</strong>
                        <span>← {match.profileLabel}</span>
                        <small>{match.reason}</small>
                      </div>
                      <div className="confidence-capsule">
                        {match.source === 'ai' ? 'AI' : '规则'} {match.confidence}
                      </div>
                    </article>
                  ))}
                </div>
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
              <p>内容保存在浏览器本地。AI 映射只发送字段名称，不发送这些具体值。</p>
            </section>

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
              <Toggle label="进入疑似网申页面后，自动扫描并填写空字段" checked={settings.autoFillJobPages} onChange={(autoFillJobPages) => setSettings({ ...settings, autoFillJobPages })} />
              <Toggle label="允许 AI 处理规则无法判断的字段" checked={settings.useAiForAmbiguousFields} onChange={(useAiForAmbiguousFields) => setSettings({ ...settings, useAiForAmbiguousFields })} />
              <Toggle label="允许覆盖网页中已有内容" checked={settings.overwriteExisting} onChange={(overwriteExisting) => setSettings({ ...settings, overwriteExisting })} dangerous />
            </section>

            <section className="settings-card">
              <span className="eyebrow">OpenAI 兼容 API</span>
              <h2>AI 只负责字段映射</h2>
              <p>发送网页字段名称和简历字段结构，不发送姓名、电话、经历正文等具体值。</p>
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
