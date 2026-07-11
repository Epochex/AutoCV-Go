import { useMemo, useRef, useState } from 'react';
import { extractResumeFile } from '../../lib/file-text';
import {
  mergeParsedProfile,
  parseResumeText,
  type ParsedResumeProfile,
  type ResumeImportFormat,
} from '../../lib/resume-import';
import { parseResumeWithAi } from '../../lib/resume-ai';
import type { ExtensionSettings, ResumeProfile } from '../../lib/types';

type ImportMode = 'replace' | 'append';
type ParseMethod = 'local' | 'ai';

type Props = {
  profile: ResumeProfile;
  settings: ExtensionSettings;
  onApply: (profile: ResumeProfile, sourceName: string) => void;
};

const BASIC_LABELS: Array<[keyof ResumeProfile['basics'], string]> = [
  ['fullName', '姓名'],
  ['phone', '手机号'],
  ['email', '邮箱'],
  ['city', '所在城市'],
  ['expectedRole', '期望职位'],
  ['expectedCity', '期望城市'],
];

function localFormat(format: 'pdf' | 'markdown' | 'latex'): ResumeImportFormat {
  return format === 'latex' ? 'tex' : format;
}

function populatedBasics(profile: ParsedResumeProfile) {
  return BASIC_LABELS.flatMap(([key, label]) => {
    const value = profile.basics?.[key];
    return value?.trim() ? [{ key, label, value }] : [];
  });
}

export default function ResumeImporter({ profile, settings, onApply }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ParsedResumeProfile | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceMeta, setSourceMeta] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [mode, setMode] = useState<ImportMode>('replace');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [applied, setApplied] = useState(false);
  const [parseMethod, setParseMethod] = useState<ParseMethod>('local');

  const basics = useMemo(() => (draft ? populatedBasics(draft) : []), [draft]);
  const aiAvailable = Boolean(settings.ai.enabled && settings.ai.apiKey);

  async function parseFile(file: File) {
    setBusy(true);
    setError('');
    setWarning('');
    setDraft(null);
    setApplied(false);
    setSourceName(file.name);
    try {
      const extracted = await extractResumeFile(file);
      setSourceMeta(
        `${extracted.pageCount ? `${extracted.pageCount} 页 · ` : ''}${extracted.text.length.toLocaleString('zh-CN')} 字符`,
      );
      let parsed: ParsedResumeProfile;
      if (useAi) {
        try {
          parsed = await parseResumeWithAi(extracted.text, extracted.format, settings.ai);
          setParseMethod('ai');
        } catch (reason) {
          parsed = parseResumeText(extracted.text, localFormat(extracted.format));
          setParseMethod('local');
          setWarning(
            `AI 解析失败，已自动改用本地规则：${reason instanceof Error ? reason.message : String(reason)}`,
          );
        }
      } else {
        parsed = parseResumeText(extracted.text, localFormat(extracted.format));
        setParseMethod('local');
      }
      setDraft(parsed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function applyDraft() {
    if (!draft) return;
    const next = mergeParsedProfile(profile, draft, { arrayMode: mode });
    onApply(next, sourceName);
    setApplied(true);
  }

  return (
    <section className="resume-importer" aria-labelledby="resume-import-title">
      <header className="section-heading">
        <div>
          <h2 id="resume-import-title">从文件导入</h2>
          <span>PDF · MD · TEX</span>
        </div>
        <button className="text-button" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? '正在解析…' : '选择文件'}
        </button>
      </header>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".pdf,.md,.markdown,.tex,application/pdf,text/markdown,application/x-tex"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void parseFile(file);
        }}
      />

      <div className="import-options">
        <label className={`import-ai-toggle ${!aiAvailable ? 'import-ai-toggle--disabled' : ''}`}>
          <input
            type="checkbox"
            checked={useAi && aiAvailable}
            disabled={!aiAvailable || busy}
            onChange={(event) => setUseAi(event.target.checked)}
          />
          <span>
            <strong>使用 AI 精准解析</strong>
            <small>
              {aiAvailable
                ? '会把提取出的简历全文发送到你在设置中配置的模型服务'
                : '未配置 API，将使用本地规则解析'}
            </small>
          </span>
        </label>
      </div>

      {!draft && !busy && !error && (
        <button className="import-dropzone" type="button" onClick={() => inputRef.current?.click()}>
          <strong>上传简历并自动解析</strong>
          <span>文件只在侧栏处理；应用前不会修改已保存资料</span>
        </button>
      )}

      {busy && (
        <div className="import-progress" role="status" aria-live="polite">
          <span className="import-spinner" aria-hidden="true" />
          <div>
            <strong>正在读取并结构化简历</strong>
            <small>{useAi ? '本地提取完成后将调用你的模型 API' : '使用本地规则，不发送文件内容'}</small>
          </div>
        </div>
      )}

      {error && (
        <div className="import-error" role="alert">
          <strong>解析失败</strong>
          <span>{error}</span>
          <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>重新选择</button>
        </div>
      )}

      {warning && !error && <div className="import-warning" role="status">{warning}</div>}

      {draft && (
        <div className="import-review">
          <header>
            <div>
              <span className="ai-output-badge">{parseMethod === 'ai' ? 'AI 解析草稿' : '本地解析草稿'}</span>
              <strong>{sourceName}</strong>
              <small>{sourceMeta}</small>
            </div>
            <button className="icon-button" type="button" onClick={() => setDraft(null)}>丢弃</button>
          </header>

          <div className="import-summary-grid">
            <span><strong>{basics.length}</strong> 基本字段</span>
            <span><strong>{draft.education?.length ?? 0}</strong> 教育</span>
            <span><strong>{(draft.work?.length ?? 0) + (draft.internship?.length ?? 0)}</strong> 工作/实习</span>
            <span><strong>{draft.projects?.length ?? 0}</strong> 项目</span>
            <span><strong>{draft.research?.length ?? 0}</strong> 科研/论文</span>
            <span><strong>{draft.openSource?.length ?? 0}</strong> 开源</span>
            <span><strong>{draft.customFields?.length ?? 0}</strong> 其他栏目</span>
          </div>

          <div className="import-preview-list">
            {basics.map((item) => (
              <div key={item.key}><span>{item.label}</span><strong>{item.value}</strong></div>
            ))}
            {draft.education?.map((item) => (
              <div key={item.id}><span>教育</span><strong>{[item.school, item.degree, item.major].filter(Boolean).join(' · ')}</strong></div>
            ))}
            {draft.internship?.map((item) => (
              <div key={item.id}><span>实习</span><strong>{[item.organization, item.role].filter(Boolean).join(' · ')}</strong></div>
            ))}
            {draft.work?.map((item) => (
              <div key={item.id}><span>工作</span><strong>{[item.organization, item.role].filter(Boolean).join(' · ')}</strong></div>
            ))}
            {draft.projects?.map((item) => (
              <div key={item.id}><span>项目</span><strong>{item.name}</strong></div>
            ))}
            {draft.research?.map((item) => (
              <div key={item.id}><span>科研</span><strong>{item.name}</strong></div>
            ))}
            {draft.openSource?.map((item) => (
              <div key={item.id}><span>开源</span><strong>{item.name}</strong></div>
            ))}
            {draft.customFields?.map((item) => (
              <div key={item.id}><span>其他</span><strong>{item.label}</strong></div>
            ))}
          </div>

          <fieldset className="import-mode">
            <legend>经历列表如何处理</legend>
            <label><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 用解析结果替换现有教育/经历/项目/科研/开源</label>
            <label><input type="radio" name="import-mode" checked={mode === 'append'} onChange={() => setMode('append')} /> 追加到现有经历之后</label>
          </fieldset>

          <button className="primary-button" type="button" onClick={applyDraft} disabled={applied}>
            {applied ? '已应用到编辑器，请继续核对' : '应用解析结果'}
          </button>
          <p className="import-apply-note">应用后仍需点击页面底部“保存简历资料”才会写入本地存储。</p>
        </div>
      )}
    </section>
  );
}
