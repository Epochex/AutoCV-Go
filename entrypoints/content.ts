import { browser } from 'wxt/browser';
import { matchFields } from '../lib/matcher';
import { matchFieldsFromMemory } from '../lib/memory';
import { loadProfile, loadSettings } from '../lib/storage';
import type {
  FieldDescriptor,
  FieldMatch,
  FillResult,
  RuntimeMessage,
  ScanResult,
} from '../lib/types';

const FIELD_ID_ATTRIBUTE = 'data-autocv-field-id';
const AUTO_RUN_REPORT_KEY = 'autocv.lastRun';
const FIELD_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="checkbox"], [role="radio"]';
const NON_FIELD_INPUT_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'image']);
const SAFE_TEXT_INPUT_TYPES = new Set([
  '',
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
]);

type FillCapability = Pick<FieldDescriptor, 'fillCapability' | 'manualReason'>;

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function compactText(value: string | null | undefined, limit = 180): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function labelText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('input, textarea, select, button, [contenteditable], [role="textbox"], [role="combobox"]')
    .forEach((control) => control.remove());
  return compactText(clone.textContent);
}

function collectFieldElements(root: Document | ShadowRoot = document): HTMLElement[] {
  const fields = Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR));
  for (const host of root.querySelectorAll<HTMLElement>('*')) {
    if (host.shadowRoot) fields.push(...collectFieldElements(host.shadowRoot));
  }
  return fields;
}

function findScannedElement(fieldId: string): HTMLElement | null {
  return collectFieldElements().find((element) => element.getAttribute(FIELD_ID_ATTRIBUTE) === fieldId) ?? null;
}

function isNativeField(
  element: HTMLElement,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function isFileInput(element: HTMLElement): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === 'file';
}

function isRequired(element: HTMLElement, label = ''): boolean {
  if (element.getAttribute('aria-required') === 'true') return true;
  if (isNativeField(element) && element.required) return true;
  const formItem = element.closest<HTMLElement>(
    '.ant-form-item, .el-form-item, [class*="form-item"], [class*="formItem"], .form-group',
  );
  return Boolean(
    /[＊*]/.test(label) ||
    formItem?.classList.contains('is-required') ||
      formItem?.querySelector('[class*="required"], .ant-form-item-required'),
  );
}

/**
 * Only controls that can be filled deterministically without opening a picker
 * are marked automatic. Everything else remains visible in the scan so the
 * side panel can guide the user through it manually.
 */
function fillCapabilityFor(element: HTMLElement): FillCapability {
  if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
    return { fillCapability: 'manual', manualReason: '控件当前不可用，请先完成页面前置步骤' };
  }

  if (element.getAttribute('aria-readonly') === 'true') {
    return { fillCapability: 'manual', manualReason: '只读控件需要通过网页提供的操作修改' };
  }

  if (isFileInput(element)) {
    return { fillCapability: 'manual', manualReason: '文件上传需要用户手动选择本地文件' };
  }

  if (element instanceof HTMLInputElement) {
    if (element.readOnly) {
      return { fillCapability: 'manual', manualReason: '只读输入框需要通过网页控件选择' };
    }
    if (element.type === 'password') {
      return { fillCapability: 'manual', manualReason: '敏感密码字段不会自动填写' };
    }
    if (element.type === 'checkbox' || element.type === 'radio') {
      return { fillCapability: 'manual', manualReason: '选项控件需要用户确认后选择' };
    }
    if (!SAFE_TEXT_INPUT_TYPES.has(element.type)) {
      return { fillCapability: 'manual', manualReason: `暂不支持自动操作 ${element.type || '自定义'} 控件` };
    }
    return { fillCapability: 'auto', manualReason: '' };
  }

  if (element instanceof HTMLTextAreaElement) {
    return element.readOnly
      ? { fillCapability: 'manual', manualReason: '只读输入框需要通过网页控件填写' }
      : { fillCapability: 'auto', manualReason: '' };
  }

  if (element instanceof HTMLSelectElement) return { fillCapability: 'auto', manualReason: '' };
  if (element.isContentEditable) return { fillCapability: 'auto', manualReason: '' };

  return {
    fillCapability: 'manual',
    manualReason: '复杂网页控件无法可靠自动操作，请手动选择或粘贴',
  };
}

function labelFor(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const labels = Array.from(element.labels ?? []).map((label) => labelText(label));
    if (labels.some(Boolean)) return labels.filter(Boolean).join(' / ');
  }

  const aria = element.getAttribute('aria-label');
  if (aria) return compactText(aria);

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const root = element.getRootNode();
    if (root instanceof Document || root instanceof ShadowRoot) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => root.getElementById(id)?.textContent)
        .map((value) => compactText(value))
        .filter(Boolean)
        .join(' / ');
      if (text) return text;
    }
  }

  const id = element.id;
  if (id) {
    const root = element.getRootNode();
    const explicit =
      root instanceof Document || root instanceof ShadowRoot
        ? root.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)
        : null;
    if (explicit) return compactText(explicit.textContent);
  }

  const formItem = element.closest<HTMLElement>(
    '.ant-form-item, .el-form-item, [class*="form-item"], [class*="formItem"], .form-group, fieldset',
  );
  if (formItem) {
    const itemLabel = formItem.querySelector<HTMLElement>(
      'label, .ant-form-item-label, .el-form-item__label, [class*="label"]',
    );
    if (itemLabel) return labelText(itemLabel);
  }

  const previous = element.previousElementSibling;
  return previous instanceof HTMLElement ? compactText(previous.textContent) : '';
}

function sectionFor(element: HTMLElement): string {
  const container = element.closest<HTMLElement>(
    'fieldset, section, article, [class*="experience"], [class*="project"], [class*="education"], [class*="resume-item"], [class*="form-section"]',
  );
  if (!container) return '';
  const heading = container.querySelector<HTMLElement>('legend, h1, h2, h3, h4, [class*="title"]');
  return compactText(heading?.textContent, 220);
}

function getCurrentValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'file') return Array.from(element.files ?? []).map((file) => file.name).join(', ');
    if (element.type === 'password') return element.value ? '••••••••' : '';
    if (element.type === 'checkbox' || element.type === 'radio') return element.checked ? element.value || 'true' : '';
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
  const ariaValue = element.getAttribute('aria-valuetext') || element.getAttribute('aria-value');
  if (ariaValue) return compactText(ariaValue, 500);
  const text = compactText(element.textContent, 500);
  return /^(请选择|请选择.+|select|choose)$/i.test(text) ? '' : text;
}

function scanPage(): ScanResult {
  const elements = collectFieldElements().filter((element) => {
    if (element instanceof HTMLInputElement && NON_FIELD_INPUT_TYPES.has(element.type)) return false;
    // Native file inputs are commonly visually hidden behind an upload button,
    // but are still real fields the user must complete.
    if (!isFileInput(element) && (!isVisible(element) || element.getAttribute('aria-hidden') === 'true')) return false;
    // Avoid reporting both a custom wrapper and the native control it contains.
    if (
      !isNativeField(element) &&
      Array.from(element.querySelectorAll<HTMLElement>('input, textarea, select, [contenteditable]')).some(
        (descendant) => isFileInput(descendant) || isVisible(descendant),
      )
    ) return false;
    return true;
  });

  const occurrenceMap = new Map<string, number>();
  const fields = elements.map((element, index): FieldDescriptor => {
    const id = element.getAttribute(FIELD_ID_ATTRIBUTE) || `af-${Date.now().toString(36)}-${index}`;
    element.setAttribute(FIELD_ID_ATTRIBUTE, id);
    const label = labelFor(element);
    const name = compactText(element.getAttribute('name') || element.id);
    const placeholder = compactText(element.getAttribute('placeholder'));
    const signature = (label || placeholder || name || `${element.tagName}-${index}`).toLowerCase().replace(/\s+/g, '');
    const occurrence = occurrenceMap.get(signature) ?? 0;
    occurrenceMap.set(signature, occurrence + 1);
    const capability = fillCapabilityFor(element);

    return {
      id,
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type') || element.getAttribute('role') || element.tagName.toLowerCase(),
      label,
      name,
      placeholder,
      section: sectionFor(element),
      options:
        element instanceof HTMLSelectElement
          ? Array.from(element.options).map((option) => compactText(option.textContent || option.value))
          : [],
      currentValue: getCurrentValue(element),
      occurrence,
      required: isRequired(element, label),
      ...capability,
    };
  });

  const pageSignal = `${location.href} ${document.title} ${compactText(document.body.innerText, 3000)}`.toLowerCase();
  const jobTokens = ['网申', '投递', '简历', '招聘', '应聘', '教育经历', '项目经历', '工作经历', 'campus', 'career', 'resume', 'apply', 'recruit', 'job'];
  const signalCount = jobTokens.filter((token) => pageSignal.includes(token)).length;

  return {
    url: location.href,
    title: document.title,
    likelyJobPage: signalCount >= 2 && fields.length >= 3,
    fields,
  };
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function fillElement(element: HTMLElement, value: string, overwrite: boolean): { ok: boolean; reason?: string } {
  const capability = fillCapabilityFor(element);
  if (capability.fillCapability === 'manual') return { ok: false, reason: capability.manualReason };

  const existing = getCurrentValue(element).trim();
  if (existing && !overwrite) return { ok: false, reason: '字段已有内容' };

  if (element instanceof HTMLInputElement) {
    setNativeValue(element, value);
    return { ok: element.value === value };
  }

  if (element instanceof HTMLTextAreaElement) {
    setNativeValue(element, value);
    return { ok: element.value === value };
  }

  if (element instanceof HTMLSelectElement) {
    const target = Array.from(element.options).find(
      (option) => option.value === value || compactText(option.textContent) === value || compactText(option.textContent).includes(value),
    );
    if (!target) return { ok: false, reason: '下拉选项中没有匹配值' };
    element.value = target.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  }

  if (element.isContentEditable) {
    element.focus();
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    return { ok: true };
  }

  return { ok: false, reason: '暂不支持该控件类型' };
}

function fillMatches(matches: FieldMatch[], overwrite: boolean): FillResult {
  const result: FillResult = { filled: 0, skipped: 0, filledFieldIds: [], skippedFieldIds: [], failed: [] };
  for (const match of matches) {
    const element = findScannedElement(match.fieldId);
    if (!element) {
      result.failed.push({ fieldId: match.fieldId, reason: '页面结构已变化，请重新扫描' });
      continue;
    }
    const outcome = fillElement(element, match.value, overwrite);
    if (outcome.ok) {
      result.filled += 1;
      result.filledFieldIds.push(match.fieldId);
    } else if (outcome.reason === '字段已有内容') {
      result.skipped += 1;
      result.skippedFieldIds.push(match.fieldId);
    }
    else result.failed.push({ fieldId: match.fieldId, reason: outcome.reason || '填写失败' });
  }
  return result;
}

async function runAutomaticFill(): Promise<void> {
  const [profile, settings] = await Promise.all([loadProfile(), loadSettings()]);
  if (!settings.autoFillJobPages) return;
  const scan = scanPage();
  if (!scan.likelyJobPage) return;
  const autoFields = scan.fields.filter((field) => field.fillCapability === 'auto');
  const rememberedMatches = settings.rememberConfirmedMappings
    ? await matchFieldsFromMemory(autoFields, profile, scan.url)
    : [];
  const rememberedFieldIds = new Set(rememberedMatches.map((match) => match.fieldId));
  const ruleMatches = matchFields(
    autoFields.filter((field) => !rememberedFieldIds.has(field.id)),
    profile,
  );
  const matches = [...rememberedMatches, ...ruleMatches].filter((match) => match.confidence >= 82);
  const result = fillMatches(matches, settings.overwriteExisting);
  await browser.storage.local.set({
    [AUTO_RUN_REPORT_KEY]: {
      at: new Date().toISOString(),
      matched: matches.length,
      ...result,
    },
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      if (message.type === 'AUTOCV_SCAN') return Promise.resolve(scanPage());
      if (message.type === 'AUTOCV_FILL') return Promise.resolve(fillMatches(message.matches, message.overwrite));
      if (message.type === 'AUTOCV_AUTO_RUN') return runAutomaticFill().then(() => ({ ok: true }));
      return undefined;
    });

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (attempts >= 3) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        attempts += 1;
        void runAutomaticFill();
      }, attempts === 0 ? 1200 : 900);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12000);
  },
});
