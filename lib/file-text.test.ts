import { describe, expect, it } from 'vitest';
import { extractResumeFile } from './file-text';

describe('extractResumeFile', () => {
  it('reads Markdown and LaTeX files locally', async () => {
    const markdown = await extractResumeFile(
      new File(['# 张三\n\n邮箱：test@example.com'], 'resume.md', { type: 'text/markdown' }),
    );
    const latex = await extractResumeFile(
      new File(['\\documentclass{article}\n\\begin{document}\n张三\\end{document}'], 'resume.tex', {
        type: 'application/x-tex',
      }),
    );
    expect(markdown).toMatchObject({ format: 'markdown', fileName: 'resume.md' });
    expect(markdown.text).toContain('test@example.com');
    expect(latex).toMatchObject({ format: 'latex', fileName: 'resume.tex' });
  });

  it('rejects unsupported and oversized files with readable errors', async () => {
    await expect(extractResumeFile(new File(['plain text resume content'], 'resume.txt'))).rejects.toThrow(
      '仅支持 PDF、Markdown（.md）和 LaTeX（.tex）文件',
    );
    const oversized = new File(['x'.repeat(12 * 1024 * 1024 + 1)], 'large.md', {
      type: 'text/markdown',
    });
    await expect(extractResumeFile(oversized)).rejects.toThrow('文件超过 12 MB');
  });
});
