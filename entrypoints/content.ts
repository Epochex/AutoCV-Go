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
type FillOutcome = { ok: boolean; reason?: string };

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
    .querySelectorAll(
      'input, textarea, select, button, [contenteditable], [role="textbox"], [role="combobox"], [class*="tip"], [class*="help"], [class*="error"], [class*="counter"]',
    )
    .forEach((control) => control.remove());
  return compactText(clone.textContent);
}

function usableLabel(value: string, element: HTMLElement): string {
  const text = compactText(value, 80).replace(/[＊*]\s*$/, '').trim();
  if (!text || text === compactText(element.getAttribute('placeholder'))) return '';
  if (/^(请选择|请输入|搜索|select|choose)(?:\s|$)/i.test(text)) return '';
  return text.length <= 48 ? text : '';
}

/**
 * Modern recruitment sites often render labels as unrelated divs next to a
 * custom control. Walk a few small ancestors and prefer their label/name
 * nodes instead of falling back to the entire form row text.
 */
function nearbyFormLabel(element: HTMLElement): string {
  let container: HTMLElement | null = element.parentElement;
  for (let depth = 0; container && depth < 6 && container !== document.body; depth += 1) {
    const fieldCount = container.querySelectorAll(FIELD_SELECTOR).length;
    if (fieldCount <= 3) {
      const explicit = Array.from(
        container.querySelectorAll<HTMLElement>(
          'label, [class*="label"], [class*="Label"], [class*="field-name"], [class*="fieldName"], dt',
        ),
      )
        .map((candidate) => usableLabel(labelText(candidate), element))
        .find(Boolean);
      if (explicit) return explicit;

      const previous = container.previousElementSibling;
      if (previous instanceof HTMLElement) {
        const siblingLabel = usableLabel(labelText(previous), element);
        if (siblingLabel) return siblingLabel;
      }
    }
    container = container.parentElement;
  }
  return '';
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

function classSignal(element: HTMLElement): string {
  let current: HTMLElement | null = element;
  const tokens: string[] = [];
  for (let depth = 0; current && depth < 4; depth += 1) {
    tokens.push(current.className || '', current.getAttribute('role') || '');
    current = current.parentElement;
  }
  return tokens.join(' ').toLowerCase();
}

function interactiveControlKind(element: HTMLElement): 'select' | 'date' | undefined {
  const signal = classSignal(element);
  const nearbyLabel = element instanceof HTMLInputElement && element.readOnly ? nearbyFormLabel(element) : '';
  if (
    element.getAttribute('role') === 'combobox' ||
    Boolean(element.closest('[role="combobox"]')) ||
    /(?:^|[\s_-])(select|cascader|dropdown)(?:[\s_-]|$)/.test(signal)
  ) return 'select';
  if (
    /(?:date|month|year|time)[-_ ]?(?:picker|select|editor)|picker[-_ ]?(?:date|month|year|time)/.test(signal) ||
    (element instanceof HTMLInputElement &&
      element.readOnly &&
      (/(?:^|[\s_-])picker(?:[\s_-]|$)/.test(signal) || /日期|时间|年月|生日/.test(nearbyLabel)))
  ) {
    return 'date';
  }
  if (
    element instanceof HTMLInputElement &&
    element.readOnly &&
    /请选择|选择/.test(element.placeholder)
  ) return 'select';
  return undefined;
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

  if (element.getAttribute('aria-readonly') === 'true' && !interactiveControlKind(element)) {
    return { fillCapability: 'manual', manualReason: '只读控件需要通过网页提供的操作修改' };
  }

  if (isFileInput(element)) {
    return { fillCapability: 'manual', manualReason: '文件上传需要用户手动选择本地文件' };
  }

  if (element instanceof HTMLInputElement) {
    if (element.readOnly && !interactiveControlKind(element)) {
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

  if (interactiveControlKind(element) === 'select') {
    return { fillCapability: 'auto', manualReason: '' };
  }

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
    '.ant-form-item, .el-form-item, [class*="form-item"], [class*="formItem"], [class*="field-item"], [class*="fieldItem"], .form-group, fieldset',
  );
  if (formItem) {
    const itemLabel = formItem.querySelector<HTMLElement>(
      'label, .ant-form-item-label, .el-form-item__label, [class*="label"]',
    );
    if (itemLabel) return labelText(itemLabel);
  }

  const nearby = nearbyFormLabel(element);
  if (nearby) return nearby;

  const previous = element.previousElementSibling;
  return previous instanceof HTMLElement ? usableLabel(labelText(previous), element) : '';
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
  element.focus();
  setter?.call(element, value);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();
}

function normalizeChoice(value: string): string {
  return compactText(value, 200)
    .toLowerCase()
    .replace(/研究生/g, '')
    .replace(/[\s·•,，、/\\()（）\-—_]/g, '')
    .replace(/[省市区县]$/g, '');
}

function visibleOptionElements(): HTMLElement[] {
  const selector = [
    '[role="option"]',
    '[role="menuitem"]',
    '.ant-select-item-option',
    '.ant-cascader-menu-item',
    '.el-select-dropdown__item',
    '.el-cascader-node',
    '[class*="select-option"]',
    '[class*="selectOption"]',
    '[class*="dropdown-item"]',
    '[class*="dropdownItem"]',
    '[class*="dropdown"] [class*="item"]',
    '[class*="popover"] [class*="item"]',
    '[class*="popper"] [class*="item"]',
    '[class*="menu"] [class*="item"]',
    '[class*="option"]',
  ].join(',');
  return collectRoots().flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (option) => isVisible(option) && option.getAttribute('aria-disabled') !== 'true' && !option.hasAttribute('disabled'),
    ),
  );
}

function collectRoots(root: Document | ShadowRoot = document): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [root];
  for (const host of root.querySelectorAll<HTMLElement>('*')) {
    if (host.shadowRoot) roots.push(...collectRoots(host.shadowRoot));
  }
  return roots;
}

function clickControl(element: HTMLElement): void {
  const target =
    element.closest<HTMLElement>(
      '[role="combobox"], .ant-select, .ant-picker, .el-select, .el-date-editor, [class*="select-selector"], [class*="selectSelector"], [class*="cascader"], [class*="picker"]',
    ) ?? element;
  target.focus();
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  target.click();
}

function waitForUi(milliseconds = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function optionScore(optionText: string, requestedValue: string): number {
  const option = normalizeChoice(optionText);
  const requested = normalizeChoice(requestedValue);
  if (!option || !requested) return 0;
  if (option === requested) return 100;
  if (option.includes(requested) || requested.includes(option)) return 80;
  const aliases: Record<string, string[]> = {
    男: ['男性', '男生', 'male'],
    女: ['女性', '女生', 'female'],
    本科: ['学士'],
    硕士: ['硕士研究生'],
    博士: ['博士研究生'],
  };
  return aliases[requested]?.some((alias) => option === normalizeChoice(alias)) ? 90 : 0;
}

async function fillInteractiveSelect(element: HTMLElement, value: string): Promise<FillOutcome> {
  const before = getCurrentValue(element).trim();
  clickControl(element);
  await waitForUi();

  // Cascaders may reveal another column after the first choice. Repeat a
  // bounded number of times while matching the strongest visible option.
  for (let depth = 0; depth < 3; depth += 1) {
    const ranked = visibleOptionElements()
      .map((option) => ({ option, score: optionScore(option.textContent || '', value) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best) {
      await waitForUi();
      continue;
    }
    best.option.scrollIntoView({ block: 'nearest' });
    best.option.click();
    await waitForUi();
    const current = getCurrentValue(element).trim();
    if (current && current !== before) return { ok: true };
  }

  const current = getCurrentValue(element).trim();
  if (current && current !== before) return { ok: true };
  return { ok: false, reason: '已打开下拉框，但没有找到与资料一致的选项' };
}

async function fillInteractiveDate(element: HTMLInputElement, value: string): Promise<FillOutcome> {
  const normalized = value.trim().replace(/[./年]/g, '-').replace(/月/g, '-').replace(/日/g, '');
  const wasReadOnly = element.readOnly;
  if (wasReadOnly) element.readOnly = false;
  setNativeValue(element, normalized);
  if (wasReadOnly) element.readOnly = true;
  await waitForUi(60);
  if (normalizeChoice(element.value) === normalizeChoice(normalized)) return { ok: true };
  return { ok: false, reason: '日期组件拒绝直接写入，请打开日期面板后手动确认' };
}

async function fillElement(element: HTMLElement, value: string, overwrite: boolean): Promise<FillOutcome> {
  const capability = fillCapabilityFor(element);
  if (capability.fillCapability === 'manual') return { ok: false, reason: capability.manualReason };

  const existing = getCurrentValue(element).trim();
  if (existing && !overwrite) return { ok: false, reason: '字段已有内容' };

  if (element instanceof HTMLInputElement) {
    const kind = interactiveControlKind(element);
    if (kind === 'select') return fillInteractiveSelect(element, value);
    if (kind === 'date') return fillInteractiveDate(element, value);
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

  if (interactiveControlKind(element) === 'select') return fillInteractiveSelect(element, value);

  return { ok: false, reason: '暂不支持该控件类型' };
}

async function fillMatches(matches: FieldMatch[], overwrite: boolean): Promise<FillResult> {
  const result: FillResult = { filled: 0, skipped: 0, filledFieldIds: [], skippedFieldIds: [], failed: [] };
  for (const match of matches) {
    const element = findScannedElement(match.fieldId);
    if (!element) {
      result.failed.push({ fieldId: match.fieldId, reason: '页面结构已变化，请重新扫描' });
      continue;
    }
    const outcome = await fillElement(element, match.value, overwrite);
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
  const result = await fillMatches(matches, settings.overwriteExisting);
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
      if (message.type === 'AUTOCV_FILL') return fillMatches(message.matches, message.overwrite);
      if (message.type === 'AUTOCV_AUTO_RUN') return runAutomaticFill().then(() => ({ ok: true }));
      return undefined;
    });

    let attempts = 0;
    let lastAutomaticSignature = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (attempts >= 12) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        attempts += 1;
        const signature = collectFieldElements()
          .map((field) => `${field.tagName}:${field.getAttribute('name') || field.id}:${getCurrentValue(field)}`)
          .join('|');
        if (signature === lastAutomaticSignature) return;
        lastAutomaticSignature = signature;
        void runAutomaticFill();
      }, attempts === 0 ? 1200 : 700);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 60000);
  },
});
