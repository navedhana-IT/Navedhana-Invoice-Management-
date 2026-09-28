'use client';
import * as D from '@radix-ui/react-dialog';
import * as M from '@radix-ui/react-dropdown-menu';
import * as P from '@radix-ui/react-popover';
import * as T from '@radix-ui/react-tabs';
import * as Tip from '@radix-ui/react-tooltip';
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const overlay = 'fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in';

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Modal dialog: focus trap, Esc, scroll lock and aria wiring come from Radix. */
export function Dialog({ open, onClose, title, description, children, footer, wide, size }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; size?: keyof typeof sizes;
}) {
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] w-full flex-col rounded-t-2xl border bg-surface text-fg shadow-lg outline-none data-[state=open]:animate-slide-up',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            sizes[size ?? (wide ? 'xl' : 'md')],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <D.Title className="font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>}
            </div>
            <D.Close className="-mr-1 rounded-md p-1.5 text-fg-muted hover:bg-muted hover:text-fg" aria-label="Close"><X className="size-4" /></D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t px-5 py-3.5 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Side drawer (mobile navigation, filters, quick views). */
export function Sheet({ open, onClose, title, side = 'right', children, className }: {
  open: boolean; onClose: () => void; title: string; side?: 'left' | 'right'; children: ReactNode; className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            'fixed inset-y-0 z-50 flex w-[85vw] max-w-sm flex-col bg-surface text-fg shadow-lg outline-none',
            side === 'left' ? 'left-0 border-r data-[state=open]:animate-slide-in-left' : 'right-0 border-l data-[state=open]:animate-slide-in-right',
            className,
          )}
        >
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const SheetClose = D.Close;

export function DropdownMenu({ trigger, children, align = 'end', label }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end'; label?: string }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild aria-label={label}>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content align={align} sideOffset={6} className="z-50 min-w-48 rounded-xl border bg-surface p-1 text-sm shadow-lg data-[state=open]:animate-fade-in">
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({ children, onSelect, danger, disabled, icon }: { children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode }) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn('flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[disabled]:opacity-50', danger && 'text-danger data-[highlighted]:bg-danger-soft')}
    >
      {icon && <span className="text-fg-muted [&>svg]:size-4" aria-hidden>{icon}</span>}
      {children}
    </M.Item>
  );
}

export function MenuCheckItem({ children, checked, onCheckedChange }: { children: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <M.CheckboxItem checked={checked} onCheckedChange={onCheckedChange} onSelect={(e) => e.preventDefault()}
      className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-muted">
      <span className="grid size-4 place-items-center rounded border">{checked && <Check className="size-3" />}</span>
      {children}
    </M.CheckboxItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-fg-muted">{children}</M.Label>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function Popover({ trigger, children, align = 'start', className, open, onOpenChange }: {
  trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string; open?: boolean; onOpenChange?: (o: boolean) => void;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content align={align} sideOffset={6} collisionPadding={8}
          className={cn('z-50 w-[var(--radix-popover-trigger-width)] min-w-56 max-w-[calc(100vw-1rem)] rounded-xl border bg-surface p-0 shadow-lg outline-none data-[state=open]:animate-fade-in', className)}>
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Tip.Provider delayDuration={300}>{children}</Tip.Provider>;
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tip.Root>
      <Tip.Trigger asChild>{children}</Tip.Trigger>
      <Tip.Portal>
        <Tip.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-fg px-2 py-1 text-xs text-bg shadow-md data-[state=delayed-open]:animate-fade-in">
          {content}
        </Tip.Content>
      </Tip.Portal>
    </Tip.Root>
  );
}

export function Tabs({ value, onValueChange, tabs, children, className }: {
  value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode }[]; children?: ReactNode; className?: string;
}) {
  return (
    <T.Root value={value} onValueChange={onValueChange} className={className}>
      <T.List className="-mx-1 flex gap-1 overflow-x-auto border-b px-1" aria-label="Sections">
        {tabs.map((t) => (
          <T.Trigger key={t.value} value={t.value}
            className="-mb-px shrink-0 cursor-pointer border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:border-primary data-[state=active]:text-primary">
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}

export const TabPanel = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => (
  <T.Content value={value} className={cn('pt-5 outline-none', className)}>{children}</T.Content>
);
