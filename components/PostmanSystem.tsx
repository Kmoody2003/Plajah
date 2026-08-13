import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Mail, PenLine } from 'lucide-react';
import { Button } from './ui';
import { formatMailTime, listAccounts, listMessages } from '../services/postmanService';
import type { PostmanMessage } from '../types';

/**
 * The Post Man inside ChatSystem's Mail tab.
 *
 * This renders in the chat SIDEBAR — a ~320px column with no fixed height — so it
 * is a doorway, not the app. A list, reader and composer squeezed into that width
 * is unusable, and the iframe this replaces was doing exactly that. Instead: the
 * few most recent letters, and a button through to the full view.
 *
 * Navigation goes through the platform's OPEN_* CustomEvent convention (the same
 * one AppsView uses for the native app tiles), so this file needs no router.
 */
const PostmanSystem: React.FC = () => {
  const [messages, setMessages] = useState<PostmanMessage[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const accounts = await listAccounts();
        if (!live) return;
        if (!accounts.length) { setState('empty'); return; }
        const { messages: next } = await listMessages(accounts[0].id, 6);
        if (!live) return;
        setMessages(next);
        setState('ready');
      } catch {
        if (live) setState('empty');
      }
    })();
    return () => { live = false; };
  }, []);

  const open = () => window.dispatchEvent(new CustomEvent('OPEN_POSTMAN'));
  const unread = messages.filter((m) => m.unread).length;

  return (
    <div className="rounded-[2rem] border border-theme overflow-hidden"
         style={{ background: 'var(--card-bg)' }}>
      <div className="px-4 py-3.5 border-b border-theme flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Mail size={15} className="text-brand-orange shrink-0" />
          <span className="pj-eyebrow truncate">
            The Post Man{unread > 0 ? ` — ${unread} unread` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={open}
          aria-label="Open The Post Man"
          className="p-1.5 rounded-full transition-colors hover:bg-white/10 tap"
          style={{ color: 'var(--on-surface-variant)' }}
        >
          <ArrowUpRight size={14} />
        </button>
      </div>

      {state === 'loading' ? (
        <div className="p-6 flex justify-center">
          <span className="pj-eyebrow" style={{ opacity: 0.5 }}>Loading</span>
        </div>
      ) : state === 'empty' ? (
        <div className="p-5 flex flex-col items-center gap-3 text-center">
          <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>
            Connect a mailbox to read your letters here.
          </p>
          <Button variant="secondary" size="xs" onClick={open}>Open The Post Man</Button>
        </div>
      ) : (
        <>
          <ul className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={open}
                  className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors block"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`pm-subject text-[13px] truncate ${m.unread ? 'font-bold' : ''}`}>
                      {m.subject || '(No subject)'}
                    </span>
                    <span className="text-[9px] shrink-0 tabular-nums"
                          style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono-tech)' }}>
                      {formatMailTime(m.date)}
                    </span>
                  </div>
                  <span className="block text-[10px] truncate mt-0.5"
                        style={{ color: 'var(--on-surface-variant)' }}>
                    {m.from.name || m.from.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="p-3">
            <Button variant="secondary" size="xs" icon={<PenLine />} onClick={open} fullWidth>
              Open The Post Man
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default PostmanSystem;
