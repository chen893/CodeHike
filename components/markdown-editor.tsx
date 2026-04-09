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
    <div className="markdown-editor">
      <div className="md-toolbar">
        <button type="button" className="md-toolbar-btn" onClick={() => handleToolbar('bold')} title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" className="md-toolbar-btn" onClick={() => handleToolbar('italic')} title="Italic">
          <em>I</em>
        </button>
        <button type="button" className="md-toolbar-btn" onClick={() => handleToolbar('code')} title="Inline code">
          <code>{'{}'}</code>
        </button>
        <div className="md-toolbar-divider" />
        <button type="button" className="md-toolbar-btn" onClick={() => handleToolbar('quote')} title="Blockquote">
          &ldquo;
        </button>
        <button type="button" className="md-toolbar-btn" onClick={() => handleToolbar('link')} title="Link">
          &#x1F517;
        </button>
        <div className="md-tabs">
          <button
            type="button"
            className={`md-tab${tab === 'edit' ? ' active' : ''}`}
            onClick={() => setTab('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            className={`md-tab${tab === 'preview' ? ' active' : ''}`}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      </div>
      <div className="md-content">
        {tab === 'edit' ? (
          <textarea
            ref={textareaRef}
            className="md-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <div
            className="md-preview"
            dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(value) }}
          />
        )}
      </div>
    </div>
  );
}
