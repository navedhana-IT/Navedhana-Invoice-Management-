import { cn } from '@/lib/utils';

const LEVELS = [
  { label: 'Too short', cls: 'bg-danger' },
  { label: 'Weak', cls: 'bg-danger' },
  { label: 'Fair', cls: 'bg-warning' },
  { label: 'Good', cls: 'bg-success' },
  { label: 'Strong', cls: 'bg-success' },
];

export function passwordScore(p: string) {
  if (p.length < 8) return 0;
  const bonuses = [p.length >= 12, /[a-z]/.test(p) && /[A-Z]/.test(p), /[A-Za-z]/.test(p) && /\d/.test(p), /[^A-Za-z0-9]/.test(p)];
  return Math.min(4, 1 + bonuses.filter(Boolean).length);
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  const level = LEVELS[score];
  return (
    <div className="-mt-2 grid gap-1" aria-live="polite">
      <div className="grid grid-cols-4 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => <span key={i} className={cn('h-1 rounded-full', i <= score ? level.cls : 'bg-muted')} />)}
      </div>
      <span className="text-xs text-fg-muted">Password strength: {level.label}</span>
    </div>
  );
}
