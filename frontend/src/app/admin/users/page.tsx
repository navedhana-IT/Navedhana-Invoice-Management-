'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, UserCheck, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';
import { FilterSelect, ListCard, PageHeader, useList } from '@/components/data';
import { Badge, Button, DropdownMenu, Empty, MenuItem, useConfirm } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { dateTime } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type PlatformUser = {
  id: Id; email: string; fullName: string; phone: string | null; status: 'ACTIVE' | 'INACTIVE'; isMasterAdmin: boolean;
  lastLoginAt: string | null; createdAt: string;
  memberships: { status: string; company: { id: Id; displayName: string } }[];
};

export default function PlatformUsersPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { me } = useSession();
  const list = useList<PlatformUser>('/admin/users', { filters: ['status'], sort: 'createdAt:desc' });
  const setStatus = useMutation({
    mutationFn: ({ u, status }: { u: PlatformUser; status: 'ACTIVE' | 'INACTIVE' }) => api(`/admin/users/${u.id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (_, { u, status }) => { toast.success(status === 'ACTIVE' ? `${u.fullName} can sign in again` : `${u.fullName} has been deactivated`); qc.invalidateQueries({ queryKey: ['/admin/users'] }); },
  });

  const askDeactivate = async (u: PlatformUser) => {
    const ok = await confirm({
      title: `Deactivate ${u.fullName}?`,
      description: 'They’re signed out everywhere and can’t sign in to any company until reactivated. Their records stay intact.',
      confirmLabel: 'Deactivate', tone: 'danger',
    });
    if (ok) setStatus.mutate({ u, status: 'INACTIVE' });
  };

  return (
    <>
      <PageHeader title="Users" description="Everyone with an nbills account, across all companies." />
      <ListCard
        list={list}
        searchPlaceholder="Search name or email…"
        toolbar={<FilterSelect list={list} name="status" label="Status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />}
        empty={<Empty icon={<Users className="size-5" />} title="No users found" description="Try a different search or filter." />}
        columns={[
          {
            key: 'user', header: 'User', sort: 'fullName', primary: true,
            cell: (u) => (
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium">{u.fullName}{u.isMasterAdmin && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">Platform admin</span>}</p>
                <p className="truncate text-xs text-fg-muted">{u.email}</p>
              </div>
            ),
          },
          {
            key: 'companies', header: 'Companies', hideOnMobile: true,
            cell: (u) => u.memberships.length ? <span className="text-sm">{u.memberships.map((m) => m.company.displayName).join(', ')}</span> : <span className="text-fg-muted">—</span>,
          },
          { key: 'last', header: 'Last sign-in', sort: 'lastLoginAt', hideOnMobile: true, cell: (u) => <span className="text-fg-muted">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</span> },
          { key: 'status', header: 'Status', cell: (u) => <Badge value={u.status} /> },
          {
            key: 'actions', header: 'Actions',
            cell: (u) => u.id !== me.id && (
              <DropdownMenu label={`Actions for ${u.fullName}`} align="end" trigger={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.fullName}`}><MoreHorizontal className="size-4" /></Button>}>
                {u.status === 'ACTIVE'
                  ? <MenuItem danger icon={<UserX className="size-4" />} onSelect={() => askDeactivate(u)}>Deactivate</MenuItem>
                  : <MenuItem icon={<UserCheck className="size-4" />} onSelect={() => setStatus.mutate({ u, status: 'ACTIVE' })}>Reactivate</MenuItem>}
              </DropdownMenu>
            ),
          },
        ]}
      />
    </>
  );
}
