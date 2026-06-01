// Lightweight markdown → HTML renderer for Discussion posts/comments.
// Handles: bold, italic, inline code, code blocks, headers, links, blockquotes, lists.
// Output is sanitized — only allows specific safe tags.

export function renderDiscussionMarkdown(text: string): string {
  if (!text) return '';
  let s = text;

  // Escape HTML entities first
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  s = s.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre class="bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-xs font-mono overflow-x-auto my-2 whitespace-pre">${code.trim()}</pre>`
  );

  // Inline code (`...`)
  s = s.replace(/`([^`\n]+)`/g, (_, code) =>
    `<code class="bg-white/8 rounded px-1.5 py-0.5 text-[11px] font-mono text-amber-300">${code}</code>`
  );

  // Blockquote (> ...)
  s = s.replace(/^&gt;\s?(.+)$/gm, (_, content) =>
    `<blockquote class="border-l-2 border-white/20 pl-3 text-white/50 italic my-1">${content}</blockquote>`
  );

  // Headers
  s = s.replace(/^### (.+)$/gm, '<h3 class="text-sm font-black uppercase tracking-widest mt-4 mb-1">$1</h3>');
  s = s.replace(/^## (.+)$/gm,  '<h2 class="text-base font-black uppercase tracking-widest mt-4 mb-1">$1</h2>');
  s = s.replace(/^# (.+)$/gm,   '<h1 class="text-lg font-black uppercase tracking-widest mt-4 mb-2">$1</h1>');

  // Unordered list items
  s = s.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-white/70">$1</li>');

  // Bold (**text** or __text__)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong class="font-black text-white">$1</strong>');
  s = s.replace(/__(.+?)__/g,      '<strong class="font-black text-white">$1</strong>');

  // Italic (*text* or _text_)
  s = s.replace(/\*([^*\n]+)\*/g, '<em class="italic text-white/80">$1</em>');
  s = s.replace(/_([^_\n]+)_/g,   '<em class="italic text-white/80">$1</em>');

  // Strikethrough (~~text~~)
  s = s.replace(/~~(.+?)~~/g, '<del class="line-through text-white/40">$1</del>');

  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-violet-400 underline hover:text-violet-300 transition-colors">$1</a>'
  );

  // Bare URLs
  s = s.replace(/(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-violet-400 underline hover:text-violet-300 transition-colors break-all">$1</a>'
  );

  // Horizontal rule (--- or ***)
  s = s.replace(/^(---|___|\*\*\*)$/gm, '<hr class="border-white/10 my-3" />');

  // Newlines → breaks (outside block elements)
  s = s.replace(/\n\n/g, '</p><p class="mb-2">');
  s = s.replace(/\n/g, '<br />');
  s = `<p class="mb-2">${s}</p>`;

  return s;
}
