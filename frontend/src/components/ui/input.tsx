'use client';
import { cloneElement, forwardRef, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full min-w-0 rounded-lg border bg-surface px-3 text-sm text-fg shadow-sm transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/30';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(field, 'h-9', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(field, 'min-h-20 py-2', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(field, 'select-chevron h-9 cursor-pointer appearance-none pr-8', className)} {...p} />;
});

type FieldProps = { label: ReactNode; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string };

/** Label + control + hint/error. Wires id, aria-invalid and aria-describedby onto a single child control. */
export function Field({ label, error, hint, required, children, className }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const describe = error || hint ? msgId : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describe,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={cn('grid content-start gap-1.5 text-sm', className)}>
      <label htmlFor={isValidElement(children) ? ((children.props as { id?: string }).id ?? id) : undefined} className="font-medium text-fg">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {control}
      {error ? (
        <span id={msgId} role="alert" className="text-xs text-danger">{error}</span>
      ) : (
        hint && <span id={msgId} className="text-xs text-fg-muted">{hint}</span>
      )}
    </div>
  );
}

export function Checkbox({ label, description, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--primary)]" {...p} />
      <span>
        <span className="font-medium">{label}</span>
        {description && <span className="block text-xs text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}
