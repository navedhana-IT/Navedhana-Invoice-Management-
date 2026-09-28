'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data';
import { Button, Card, Dialog, Field, Input, Skeleton, useConfirm } from '@/components/ui';
import type { Role } from '@/features/access/types';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { titleCase } from '@/lib/utils';

export default function RolesPage() {
  const { can } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['/roles'], queryFn: () => api<Role[]>('/roles') });
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Roles & permissions" description="System roles are fixed. Create custom roles for anything else — you can only grant permissions you hold."
        actions={can('role.create') && <Button onClick={() => setEditing('new')}><Plus className="size-4" /> New role</Button>} />
      {isLoading ? <Skeleton className="h-64" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((r) => (
            <Card key={r.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <h2 className="font-semibold">{r.name}</h2>
                {r.isSystem && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-fg-muted"><Lock className="size-3" /> System</span>}
              </div>
              <p className="mt-1 flex-1 text-sm text-fg-muted">{r.description ?? `${r.permissions.length} permissions${r.allServices ? ' · all brands' : ''}`}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-fg-muted">
                <span>{r._count.members} member{r._count.members === 1 ? '' : 's'}</span>
                {!r.isSystem && can('role.update') ? <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Edit</Button> : <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>View</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New role' : editing ? editing.name : ''} wide>
        {editing && <RoleForm role={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

type Form = { name: string; description: string; allServices: boolean; permissions: string[] };

function RoleForm({ role, onDone }: { role: Role | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const confirm = useConfirm();
  const readOnly = role?.isSystem || (role ? !can('role.update') : false);
  const all = useQuery({ queryKey: ['/permissions'], queryFn: () => api<string[]>('/permissions') });
  const groups = Object.entries((all.data ?? []).reduce<Record<string, string[]>>((g, p) => ((g[p.split('.')[0]] ??= []).push(p), g), {}));
  const { register, handleSubmit } = useForm<Form>({ defaultValues: { name: role?.name ?? '', description: role?.description ?? '', allServices: role?.allServices ?? false, permissions: role?.permissions ?? [] } });
  const save = useMutation({
    mutationFn: (v: Form) => (role ? api(`/roles/${role.id}`, { method: 'PATCH', body: v }) : api('/roles', { body: v })),
    onSuccess: () => { toast.success('Role saved'); qc.invalidateQueries({ queryKey: ['/roles'] }); onDone(); },
  });
  const remove = useMutation({
    mutationFn: () => api(`/roles/${role!.id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Role deleted'); qc.invalidateQueries({ queryKey: ['/roles'] }); onDone(); },
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate({ ...v, description: v.description || '' }))} className="space-y-5">
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input {...register('name', { required: true })} /></Field>
          <Field label="Description"><Input {...register('description')} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" {...register('allServices')} /> Applies to all brands (otherwise only assigned brands)</label>
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map(([g, perms]) => (
            <div key={g} className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">{titleCase(g)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {perms.map((p) => <label key={p} className="flex items-center gap-1.5 text-sm text-fg-muted"><input type="checkbox" value={p} className="size-3.5" {...register('permissions')} />{titleCase(p.split('.')[1])}</label>)}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-between gap-2 border-t pt-4">
        {role && !role.isSystem && can('role.delete') ? (
          <Button type="button" variant="danger-ghost" loading={remove.isPending}
            onClick={async () => (await confirm({ title: `Delete the “${role.name}” role?`, description: role._count.members ? `${role._count.members} member${role._count.members === 1 ? '' : 's'} currently hold this role. Reassign them first.` : 'Nobody holds this role, so it can be removed safely.', confirmLabel: 'Delete role', tone: 'danger' })) && remove.mutate()}>
            Delete
          </Button>
        ) : <span />}
        <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onDone}>Close</Button>{!readOnly && <Button type="submit" loading={save.isPending}>Save</Button>}</div>
      </div>
    </form>
  );
}
