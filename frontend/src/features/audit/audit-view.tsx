'use client';
import { History } from 'lucide-react';
import { useState } from 'react';
import { DateRangeFilter, FilterSelect, ListCard, PageHeader, useList } from '@/components/data';
import { Dialog, Empty } from '@/components/ui';
import { dateTime, titleCase } from '@/lib/utils';
import type { Id } from '@/lib/ids';

type Log = {
  id: Id; action: string; entityType: string; entityId: Id | null; createdAt: string; ip: string | null;
  previousValue: unknown; newValue: unknown; actor: { email: string; fullName: string } | null;
};

const ENTITIES = ['invoice', 'payment', 'customer', 'vendor', 'product', 'employee', 'department', 'service', 'invoice_template', 'user', 'role', 'company', 'invitation', 'plan', 'document'];

/** Append-only audit trail viewer (company scope at /audit-logs, platform scope at /admin/audit-logs). */
export function AuditView({ path, description }: { path: string; description: string }) {
  const list = useList<Log>(path, { sort: 'createdAt:desc', filters: ['entityType', 'from', 'to'] });
  const [open, setOpen] = useState<Log | null>(null);
  return (
    <>
      <PageHeader title="Audit log" description={description} />
      <ListCard
        list={list}
        onRowClick={setOpen}
        rowLabel={(l) => `View ${titleCase(l.action)} details`}
        searchPlaceholder="Search action or record…"
        toolbar={
          <>
            <FilterSelect list={list} name="entityType" label="Record" options={ENTITIES.map((e) => ({ value: e, label: titleCase(e) }))} />
            <DateRangeFilter list={list} />
          </>
        }
        empty={<Empty icon={<History className="size-5" />} title="No activity yet" description="Changes made by your team will appear here." />}
        columns={[
          { key: 'when', header: 'When', sort: 'createdAt', cell: (l) => <span className="whitespace-nowrap text-fg-muted">{dateTime(l.createdAt)}</span> },
          { key: 'action', header: 'Action', sort: 'action', primary: true, cell: (l) => <span className="font-medium">{titleCase(l.action)}</span> },
          { key: 'entity', header: 'Record', cell: (l) => <span className="text-fg-muted">{titleCase(l.entityType)}{l.entityId && <span className="ml-1 font-mono text-xs">#{l.entityId}</span>}</span> },
          { key: 'actor', header: 'By', cell: (l) => l.actor?.fullName ?? <span className="text-fg-muted">System</span> },
        ]}
      />
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open ? titleCase(open.action) : ''} description={open ? `${dateTime(open.createdAt)} · ${open.actor ? `${open.actor.fullName} (${open.actor.email})` : 'System'}${open.ip ? ` · ${open.ip}` : ''}` : undefined} wide>
        {open && (
          <div className="grid gap-4 text-sm lg:grid-cols-2">
            {([['Before', open.previousValue], ['After', open.newValue]] as const).map(([label, v]) => (
              <div key={label} className="min-w-0">
                <p className="mb-1 font-medium">{label}</p>
                {v == null
                  ? <p className="rounded-lg bg-muted p-3 text-xs text-fg-muted">No data recorded</p>
                  : <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(v, null, 2)}</pre>}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
}
