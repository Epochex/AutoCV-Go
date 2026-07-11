import { browser } from 'wxt/browser';
import { matchFields } from '../lib/matcher';
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
const SKIPPED_INPUT_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'image', 'file', 'password']);

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function compactText(value: string | null | undefined, limit = 180): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function labelFor(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const labels = Array.from(element.labels ?? []).map((label) => compactText(label.textContent));
    if (labels.some(Boolean)) return labels.filter(Boolean).join(' / ');
  }

  const aria = element.getAttribute('aria-label');
  if (aria) return compactText(aria);

  const id = element.id;
  if (id) {
    const explicit = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (explicit) return compactText(explicit.textContent);
  }

  const formItem = element.closest<HTMLElement>(
    '.ant-form-item, .el-form-item, [class*="form-item"], [class*="formItem"], .form-group, fieldset',
  );
  if (formItem) {
    const itemLabel = formItem.querySelector<HTMLElement>(
      'label, .ant-form-item-label, .el-form-item__label, [class*="label"]',
    );
    if (itemLabel) return compactText(itemLabel.textContent);
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
  return compactText(heading?.textContent || container.textContent, 220);
}

function getCurrentValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') return element.checked ? element.value || 'true' : '';
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
  return compactText(element.textContent, 500);
}

function scanPage(): ScanResult {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('input, textarea, select, [contenteditable="true"], [role="combobox"]'),
  ).filter((element) => {
    if (!isVisible(element) || element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('disabled')) return false;
    if (element instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(element.type)) return false;
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
  const existing = getCurrentValue(element).trim();
  if (existing && !overwrite) return { ok: false, reason: '字段已有内容' };

  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      const shouldCheck = ['true', '是', '已婚', '至今'].includes(value) || element.value === value;
      if (shouldCheck !== element.checked) element.click();
      return { ok: true };
    }
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
    const element = document.querySelector<HTMLElement>(`[${FIELD_ID_ATTRIBUTE}="${CSS.escape(match.fieldId)}"]`);
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
  const matches = matchFields(scan.fields, profile).filter((match) => match.confidence >= 82);
  const result = fillMatches(matches, settings.overwriteExisting);
  await browser.storage.local.set({
    [AUTO_RUN_REPORT_KEY]: {
      at: new Date().toISOString(),
      url: scan.url,
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
