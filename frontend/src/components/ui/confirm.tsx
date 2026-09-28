'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from './button';
import { Field, Textarea } from './input';
import { Dialog } from './overlay';

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
};
type PromptOptions = ConfirmOptions & { label: string; placeholder?: string; minLength?: number };

type Pending = { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void } | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

const Ctx = createContext<{ confirm: (o: ConfirmOptions) => Promise<boolean>; prompt: (o: PromptOptions) => Promise<string | null> } | null>(null);

/** Accessible replacements for window.confirm / window.prompt: `if (await confirm({...}))`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const settled = useRef(false);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => { settled.current = false; setPending({ kind: 'confirm', opts, resolve }); }), []);
  const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>((resolve) => { settled.current = false; setText(''); setTouched(false); setPending({ kind: 'prompt', opts, resolve }); }), []);

  const close = (ok: boolean) => {
    if (!pending || settled.current) return;
    if (pending.kind === 'prompt') {
      const v = text.trim();
      if (ok && v.length < (pending.opts.minLength ?? 1)) return setTouched(true);
      settled.current = true;
      pending.resolve(ok ? v : null);
    } else {
      settled.current = true;
      pending.resolve(ok);
    }
    setPending(null);
  };

  const o = pending?.opts;
  const min = pending?.kind === 'prompt' ? (pending.opts.minLength ?? 1) : 0;
  const invalid = pending?.kind === 'prompt' && touched && text.trim().length < min;

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <Dialog
        open={!!pending}
        onClose={() => close(false)}
        title={o?.title ?? ''}
        description={pending?.kind === 'prompt' ? o?.description : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>{o?.cancelLabel ?? 'Cancel'}</Button>
            <Button variant={o?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus={pending?.kind === 'confirm'}>{o?.confirmLabel ?? 'Confirm'}</Button>
          </>
        }
      >
        {pending?.kind === 'prompt' ? (
          <form onSubmit={(e) => { e.preventDefault(); close(true); }}>
            <Field label={pending.opts.label} required error={invalid ? (min > 1 ? `Please enter at least ${min} characters.` : 'This is required.') : undefined}>
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={pending.opts.placeholder} maxLength={500} />
            </Field>
          </form>
        ) : (
          <div className="text-sm text-fg-muted">{o?.description ?? (o?.tone === 'danger' ? 'This action cannot be undone.' : 'Please confirm to continue.')}</div>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConfirm outside ConfirmProvider');
  return c.confirm;
}

export function usePrompt() {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePrompt outside ConfirmProvider');
  return c.prompt;
}
