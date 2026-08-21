import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

const { renderPdfPageMock } = vi.hoisted(() => ({
  renderPdfPageMock: vi.fn(),
}));

vi.mock('../src/utils/PdfRenderer.js', () => ({
  renderPdfPage: renderPdfPageMock,
}));

import { resolveFileRefs } from '../src/tools/use-free-llm.js';
import { TaskClassifier } from '../src/utils/TaskClassifier.js';
import { TaskType } from '../src/pipeline/middleware.js';

describe('PDF Resolution and Task Classification', () => {
  const dummyPdfPath = path.join(process.cwd(), 'scratch', 'cyber_report.pdf');

  beforeEach(async () => {
    await fs.mkdir(path.dirname(dummyPdfPath), { recursive: true });
    await fs.writeFile(dummyPdfPath, '%PDF-1.5 fake binary data \x00\x01\x02');
    renderPdfPageMock.mockReset();
  });

  it('delegates file:///...pdf to PDF resolver instead of reading binary UTF-8', async () => {
    renderPdfPageMock.mockResolvedValue({
      text: 'Cyber Forensics Report Day 3 memory acquisition details.',
      image_path: null,
      total_pages: 3,
      image_coverage_ratio: 0.05
    });

    const fileUri = `file:///${dummyPdfPath.replace(/\\/g, '/')}`;
    const userMsg = { role: 'user', content: `Please review ${fileUri} for cyber forensics rules.` };
    const messages = [userMsg];

    await resolveFileRefs(userMsg, messages, process.cwd());

    // Verify renderPdfPage was called and binary bytes were NOT injected
    expect(renderPdfPageMock).toHaveBeenCalled();
    const content = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
    expect(content).not.toContain('%PDF-1.5');
    expect(content).toContain('Cyber Forensics Report Day 3');
  });

  it('preserves TaskType.Cyber or TaskType.Coding when agentic/coding prompt includes a PDF reference', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Write a python script to parse memory dumps from this cyber forensics document.' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,dummy' } }
        ]
      }
    ];

    const classified = TaskClassifier.autoClassify(messages as any);
    // Should classify as Coding or Cyber, NOT hijacked by Vision
    expect([TaskType.Coding, TaskType.Cyber]).toContain(classified);
  });

  it('classifies as TaskType.Vision when prompt is visual or lacks explicit text task intent', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What does this diagram show in the architecture?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,dummy' } }
        ]
      }
    ];

    const classified = TaskClassifier.autoClassify(messages as any);
    expect(classified).toBe(TaskType.Vision);
  });
});
