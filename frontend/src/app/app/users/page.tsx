'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, MoreHorizontal, Plus, RotateCw, Trash2, UserPlus, XCircle } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FilterSelect, ListCard, PageHeader, useList } from '@/components/data';
import { Alert, Badge, Button, Dialog, DropdownMenu, Empty, Field, MenuItem, Select, Tabs, useConfirm } from '@/components/ui';
import { InviteForm } from '@/features/access/invite-form';
import type { Invitation, Member, Role } from '@/features/access/types';
import { api } from '@/lib/api';
import { toId } from '@/lib/ids';
import { useSession } from '@/lib/session';
import { dateTime } from '@/lib/utils';

export default function MembersPage() {
  const { can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useSearchParams().get('tab') === 'invitations' ? 'invitations' : 'members';
  const [inviting, setInviting] = useState(false);
  const canInvite = can('user.create');

  return (
    <>
      <PageHeader
        title="Members"
        description="People who can sign in to this company, their roles and brand access."
        actions={canInvite && <Button onClick={() => setInviting(true)}><UserPlus className="size-4" aria-hidden /> Invite member</Button>}
      />
      <Tabs
        value={tab}
        onValueChange={(v) => router.replace(v === 'members' ? pathname : `${pathname}?tab=${v}`, { scroll: false })}
        tabs={[{ value: 'members', label: 'Members' }, { value: 'invitations', label: 'Invitations' }]}
        className="mb-4"
      />
      {tab === 'members' ? <MembersList onInvite={canInvite ? () => setInviting(true) : undefined} /> : <InvitationsList onInvite={canInvite ? () => setInviting(true) : undefined} />}
      <Dialog open={inviting} onClose={() => setInviting(false)} title="Invite a member" description="They’ll choose their own password when they accept." wide>
        {inviting && <InviteForm onDone={() => { setInviting(false); if (tab === 'members') router.replace(`${pathname}?tab=invitations`, { scroll: false }); }} />}
      </Dialog>
    </>
  );
}

function MembersList({ onInvite }: { onInvite?: () => void }) {
  const { can } = useSession();
  const list = useList<Member>('/users', { filters: ['status'] });
  const [editing, setEditing] = useState<Member | null>(null);
  return (
    <>
      <ListCard
        list={list}
        searchPlaceholder="Search name or email…"
        onRowClick={can('user.update') ? setEditing : undefined}
        rowLabel={(m) => `Edit access for ${m.user.fullName}`}
        toolbar={<FilterSelect list={list} name="status" label="Status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />}
        empty={<Empty icon={<UserPlus className="size-5" />} title="No members found" description="Invite colleagues to work in this company." action={onInvite && <Button onClick={onInvite}><Plus className="size-4" /> Invite member</Button>} />}
        columns={[
          { key: 'name', header: 'Member', primary: true, cell: (m) => <div className="min-w-0"><p className="truncate font-medium">{m.user.fullName}</p><p className="truncate text-xs text-fg-muted">{m.user.email}</p></div> },
          { key: 'roles', header: 'Roles', cell: (m) => <div className="flex flex-wrap gap-1">{m.roles.map((r, i) => <span key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs">{r.role.name}</span>)}</div> },
          { key: 'last', header: 'Last sign-in', hideOnMobile: true, cell: (m) => <span className="text-fg-muted">{m.user.lastLoginAt ? dateTime(m.user.lastLoginAt) : 'Never'}</span> },
          { key: 'status', header: 'Status', cell: (m) => <Badge value={m.status} /> },
        ]}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={`Edit access · ${editing?.user.fullName ?? ''}`} wide>
        {editing && <AccessForm member={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function InvitationsList({ onInvite }: { onInvite?: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const list = useList<Invitation>('/invitations', { filters: ['status'] });
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['/invitations'] }); };
  const resend = useMutation({ mutationFn: (i: Invitation) => api(`/invitations/${i.id}/resend`, { method: 'POST' }), onSuccess: (_, i) => done(`Invitation resent to ${i.email}`) });
  const revoke = useMutation({ mutationFn: (i: Invitation) => api(`/invitations/${i.id}`, { method: 'DELETE' }), onSuccess: (_, i) => done(`Invitation for ${i.email} cancelled`) });

  const askRevoke = async (i: Invitation) => {
    if (await confirm({ title: `Cancel the invitation for ${i.email}?`, description: 'The link in their email will stop working. You can invite them again later.', confirmLabel: 'Cancel invitation', cancelLabel: 'Keep', tone: 'danger' })) revoke.mutate(i);
  };

  return (
    <ListCard
      list={list}
      searchPlaceholder="Search name or email…"
      toolbar={<FilterSelect list={list} name="status" label="Status" options={['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />}
      empty={<Empty icon={<MailPlus className="size-5" />} title="No invitations" description="Invitations you send appear here until they’re accepted." action={onInvite && <Button onClick={onInvite}><Plus className="size-4" /> Invite member</Button>} />}
      columns={[
        { key: 'who', header: 'Invitee', primary: true, cell: (i) => <div className="min-w-0"><p className="truncate font-medium">{i.fullName}</p><p className="truncate text-xs text-fg-muted">{i.email}</p></div> },
        { key: 'status', header: 'Status', cell: (i) => <Badge value={i.status} /> },
        { key: 'sent', header: 'Sent', hideOnMobile: true, cell: (i) => <span className="text-fg-muted">{dateTime(i.createdAt)}</span> },
        { key: 'expires', header: 'Expires', hideOnMobile: true, cell: (i) => <span className="text-fg-muted">{i.status === 'PENDING' || i.status === 'EXPIRED' ? dateTime(i.expiresAt) : '—'}</span> },
        {
          key: 'actions', header: 'Actions', cell: (i) => can('user.create') && (i.status === 'PENDING' || i.status === 'EXPIRED') && (
            <DropdownMenu label={`Actions for ${i.email}`} align="end" trigger={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${i.email}`}><MoreHorizontal className="size-4" /></Button>}>
              <MenuItem icon={<RotateCw className="size-4" />} onSelect={() => resend.mutate(i)}>{i.status === 'EXPIRED' ? 'Send a new link' : 'Resend email'}</MenuItem>
              <MenuItem icon={<XCircle className="size-4" />} danger onSelect={() => askRevoke(i)}>Cancel invitation</MenuItem>
            </DropdownMenu>
          ),
        },
      ]}
    />
  );
}

type AccessFormValues = { status: string; roles: { roleId: string; serviceId: string }[]; serviceIds: string[] };

function AccessForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { ctx, me } = useSession();
  const roles = useQuery({ queryKey: ['/roles'], queryFn: () => api<Role[]>('/roles') });
  const { register, control, handleSubmit, formState: { isDirty } } = useForm<AccessFormValues>({
    defaultValues: {
      status: member.status,
      roles: member.roles.length ? member.roles.map((r) => ({ roleId: String(r.role.id), serviceId: r.serviceId ? String(r.serviceId) : '' })) : [{ roleId: '', serviceId: '' }],
      serviceIds: member.serviceAssignments.map((a) => String(a.serviceId)),
    },
  });
  const assignments = useFieldArray({ control, name: 'roles' });
  const save = useMutation({
    mutationFn: (v: AccessFormValues) => api(`/users/${member.id}`, {
      method: 'PATCH',
      body: { status: v.status, roles: v.roles.filter((r) => r.roleId).map((r) => ({ roleId: Number(r.roleId), serviceId: toId(r.serviceId) })), serviceIds: v.serviceIds.map(Number) },
    }),
    onSuccess: () => { toast.success('Access updated'); qc.invalidateQueries({ queryKey: ['/users'] }); onDone(); },
  });

  const onSubmit = handleSubmit(async (v) => {
    if (v.status === 'INACTIVE' && member.status === 'ACTIVE') {
      const ok = await confirm({ title: `Deactivate ${member.user.fullName}?`, description: 'They’ll be signed out of this company and can’t sign in to it until reactivated.', confirmLabel: 'Deactivate', tone: 'danger' });
      if (!ok) return;
    }
    save.mutate(v);
  });

  if (member.user.id === me.id) {
    return (
      <div className="grid gap-4">
        <Alert tone="info">You can’t change your own roles or status. Ask another Company Admin to do it for you.</Alert>
        <div className="flex justify-end"><Button variant="secondary" onClick={onDone}>Close</Button></div>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <Field label="Status">
        <Select {...register('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
      </Field>
      <fieldset>
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-sm font-medium">Roles</legend>
          <Button type="button" variant="ghost" size="sm" onClick={() => assignments.append({ roleId: '', serviceId: '' })}><Plus className="size-4" /> Add role</Button>
        </div>
        <div className="grid gap-2">
          {assignments.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Select aria-label={`Role ${i + 1}`} {...register(`roles.${i}.roleId`)}><option value="">Select role…</option>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
              <Select aria-label={`Scope for role ${i + 1}`} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" {...register(`roles.${i}.serviceId`)}>
                <option value="">Company-wide</option>{ctx?.services.map((s) => <option key={s.id} value={s.id}>Only {s.displayName ?? s.name}</option>)}
              </Select>
              <Button type="button" variant="ghost" size="icon" className="row-start-1 sm:row-start-auto" onClick={() => assignments.remove(i)} aria-label={`Remove role ${i + 1}`}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      </fieldset>
      {!!ctx?.services.length && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Brand access</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ctx.services.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-input bg-surface px-3 py-2 text-sm hover:border-border-strong"><input type="checkbox" value={s.id} className="size-4 accent-[var(--primary)]" {...register('serviceIds')} />{s.displayName ?? s.name}</label>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Roles that cover all brands, like Company Admin, see every brand regardless.</p>
        </fieldset>
      )}
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!isDirty}>Save changes</Button>
      </div>
    </form>
  );
}
