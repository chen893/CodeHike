'use client';

import { useState, useRef } from 'react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

type Tab = 'edit' | 'preview';

function insertMarkup(textarea: HTMLTextAreaElement, before: string, after: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  const replacement = `${before}${selected || 'text'}${after}`;
  const newValue = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  return { newValue, cursorPos: start + before.length + (selected || 'text').length };
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return !trimmed.startsWith('javascript:') && !trimmed.startsWith('data:') && !trimmed.startsWith('vbscript:');
}

function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Links (sanitize against javascript: URLs)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
      isSafeUrl(url)
        ? `<a href="${url}" target="_blank">${text}</a>`
        : text
    )
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquote
    .replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>')
    // Paragraphs (split on double newlines)
    .split('\n\n')
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<blockquote>')) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const [tab, setTab] = useState<Tab>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleToolbar(action: string) {
    const ta = textareaRef.current;
    if (!ta) return;

    let result: { newValue: string; cursorPos: number };

    switch (action) {
      case 'bold':
        result = insertMarkup(ta, '**', '**');
        break;
      case 'italic':
        result = insertMarkup(ta, '*', '*');
        break;
      case 'code':
        result = insertMarkup(ta, '`', '`');
        break;
      case 'quote':
        result = insertMarkup(ta, '> ', '');
        break;
      case 'link':
        result = insertMarkup(ta, '[', '](url)');
        break;
      default:
        return;
    }

    onChange(result.newValue);
    // Set cursor position after React re-renders
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.cursorPos, result.cursorPos);
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-slate-400 focus-within:ring-offset-1 transition-shadow">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
          onClick={() => handleToolbar('bold')}
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-xs italic font-bold text-slate-700 transition-colors hover:bg-slate-100"
          onClick={() => handleToolbar('italic')}
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-[10px] font-mono font-bold text-slate-700 transition-colors hover:bg-slate-100"
          onClick={() => handleToolbar('code')}
          title="Inline code"
        >
          {'{}'}
        </button>
        <div className="mx-1 h-4 w-px bg-slate-200" />
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-xs text-slate-700 transition-colors hover:bg-slate-100"
          onClick={() => handleToolbar('quote')}
          title="Blockquote"
        >
          &ldquo;
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-xs text-slate-700 transition-colors hover:bg-slate-100"
          onClick={() => handleToolbar('link')}
          title="Link"
        >
          🔗
        </button>
        <div className="ml-auto flex items-center rounded-md border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
              tab === 'edit'
                ? 'bg-slate-900 text-slate-50'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            onClick={() => setTab('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
              tab === 'preview'
                ? 'bg-slate-900 text-slate-50'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      </div>
      <div className="bg-white">
        {tab === 'edit' ? (
          <textarea
            ref={textareaRef}
            className="min-h-[200px] w-full bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 font-mono"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <div
            className="min-h-[200px] space-y-4 px-4 py-3 text-sm leading-6 text-slate-700 [&_a]:text-slate-900 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-500 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-slate-900 [&_strong]:font-bold [&_p]:mb-4"
            dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(value) }}
          />
        )}
      </div>
    </div>
  );
}
