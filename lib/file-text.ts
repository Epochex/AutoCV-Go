import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export type ResumeFileFormat = 'pdf' | 'markdown' | 'latex';

export type ExtractedResumeFile = {
  format: ResumeFileFormat;
  fileName: string;
  text: string;
  pageCount?: number;
};

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const MAX_EXTRACTED_CHARACTERS = 200_000;

function formatFromFile(file: File): ResumeFileFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (extension === 'md' || extension === 'markdown' || file.type === 'text/markdown') return 'markdown';
  if (extension === 'tex' || file.type === 'application/x-tex') return 'latex';
  throw new Error('仅支持 PDF、Markdown（.md）和 LaTeX（.tex）文件');
}

function textItemToString(item: unknown): { text: string; hasEol: boolean; x: number; y: number } | null {
  if (!item || typeof item !== 'object' || !('str' in item)) return null;
  const value = item as { str?: unknown; hasEOL?: unknown; transform?: unknown };
  if (typeof value.str !== 'string') return null;
  const transform = Array.isArray(value.transform) ? value.transform : [];
  return {
    text: value.str,
    hasEol: value.hasEOL === true,
    x: typeof transform[4] === 'number' ? transform[4] : 0,
    y: typeof transform[5] === 'number' ? transform[5] : 0,
  };
}

function arrangePageText(items: unknown[]): string {
  const textItems = items.map(textItemToString).filter((item) => item !== null);
  const lines: Array<{ y: number; items: typeof textItems }> = [];
  for (const item of textItems) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({
    data,
    useWorkerFetch: false,
  });
  const pages: string[] = [];

  try {
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF 超过 ${MAX_PDF_PAGES} 页，请仅保留用于网申的简历页面`);
    }
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(arrangePageText(content.items));
      page.cleanup();
      if (pages.reduce((total, pageText) => total + pageText.length, 0) > MAX_EXTRACTED_CHARACTERS) {
        throw new Error('PDF 可提取文本超过 20 万字符，请精简后重试');
      }
    }
    return { text: pages.join('\n\n--- PAGE BREAK ---\n\n'), pageCount: pages.length };
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractResumeFile(file: File): Promise<ExtractedResumeFile> {
  const format = formatFromFile(file);
  if (file.size > MAX_FILE_SIZE) throw new Error('文件超过 12 MB，请压缩后重试');

  if (format === 'pdf') {
    const extracted = await extractPdfText(file);
    if (extracted.text.trim().length < 20) throw new Error('PDF 中没有提取到足够文本，可能是扫描图片版 PDF');
    return { format, fileName: file.name, ...extracted };
  }

  const text = await file.text();
  if (text.trim().length < 20) throw new Error('文件内容为空或过短');
  return { format, fileName: file.name, text };
}
