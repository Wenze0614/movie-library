'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TmdbStatus } from '@/lib/types';

/** Other components open the key dialog / hear about key changes through these window events. */
export const OPEN_KEY_EVENT = 'cinema:open-key';
export const KEY_CHANGED_EVENT = 'cinema:key-changed';

export function openKeyDialog() {
  window.dispatchEvent(new Event(OPEN_KEY_EVENT));
}

/** Header button showing whether a TMDB key is connected; opens the key dialog. */
export function KeyButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TmdbStatus | null>(null);

  useEffect(() => {
    api.tmdbStatus().then(setStatus).catch(() => setStatus(null));
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_KEY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_KEY_EVENT, onOpen);
  }, []);

  const connected = Boolean(status?.configured);
  return (
    <>
      <button
        type="button"
        className={`nav-key ${connected ? 'is-connected' : ''}`}
        onClick={() => setOpen(true)}
        title={connected ? 'Movie database connected' : 'Add a movie database key'}
        aria-label={connected ? 'Movie database key (connected)' : 'Add a movie database key'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="8" cy="15" r="4.2" />
          <path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
        </svg>
        <span className="nav-key-dot" aria-hidden="true" />
      </button>
      {open && (
        <ApiKeyDialog
          status={status}
          onStatus={(s) => {
            setStatus(s);
            window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ApiKeyDialog({
  status,
  onStatus,
  onClose,
}: {
  status: TmdbStatus | null;
  onStatus: (s: TmdbStatus) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onStatus(await api.saveTmdbKey(key));
      setKey('');
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onStatus(await api.removeTmdbKey());
      setSaved(false);
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.configured);
  return (
    <dialog
      ref={dialog}
      className="dialog dialog-narrow"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <form className="dialog-body" onSubmit={save}>
        <header className="dialog-head">
          <h2>Movie database</h2>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
            ×
          </button>
        </header>

        <p className="hint">
          With a free <strong>TMDB</strong> key, adding a film fills in its poster, year, director, genres and cast for
          you to review. Get one at{' '}
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
            themoviedb.org → Settings → API
          </a>{' '}
          (either the “API Key” or the “API Read Access Token” works).
        </p>

        <div className={`key-status ${connected ? 'is-connected' : ''}`} role="status">
          <span className="key-status-dot" aria-hidden="true" />
          {connected ? (
            <span>
              {saved ? 'Connected. ' : 'Connected '}
              <code>{status?.hint}</code>
              {status?.source === 'env' && <em> (from .env.local)</em>}
            </span>
          ) : (
            <span>No key yet. Films are added by hand.</span>
          )}
        </div>

        <div className="search-row">
          <input
            ref={input}
            type="password"
            className="search-input key-input"
            placeholder={connected ? 'Paste a new key to replace it' : 'Paste your TMDB key'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <p className="hint hint-small">Saved only on this computer, in data/settings.json (never committed to git).</p>

        <footer className="dialog-foot">
          {connected && status?.source === 'settings' && (
            <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>
              Remove key
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy || !key.trim()}>
            {busy ? 'Checking…' : 'Save key'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
