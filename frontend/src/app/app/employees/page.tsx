'use client';
import { MailPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Dialog } from '@/components/ui';
import { InviteForm, type InviteTarget } from '@/features/access/invite-form';
import { employees } from '@/features/resources/configs';
import { ResourcePage } from '@/features/resources/resource-page';
import { useSession } from '@/lib/session';
import type { Id } from '@/lib/ids';

type Employee = InviteTarget & { userId: Id | null };

export default function Page() {
  const { can } = useSession();
  const [inviting, setInviting] = useState<Employee | 'new' | null>(null);
  const canInvite = can('user.create');

  const cfg = canInvite
    ? {
        ...employees,
        columns: [
          ...employees.columns,
          {
            key: 'login', header: 'Workspace access', hideOnMobile: true,
            cell: (r: Record<string, unknown>) => {
              const e = r as unknown as Employee;
              if (e.userId) return <Badge value="ACTIVE" label="Has login" />;
              if (!e.email) return <span className="text-xs text-fg-muted">Add an email to invite</span>;
              return (
                <Button variant="secondary" size="sm" onClick={(ev) => { ev.stopPropagation(); setInviting(e); }} aria-label={`Invite ${e.fullName} to the workspace`}>
                  <MailPlus className="size-4" aria-hidden /> Invite
                </Button>
              );
            },
          },
        ],
      }
    : employees;

  return (
    <>
      <ResourcePage cfg={cfg} actions={canInvite && <Button variant="secondary" onClick={() => setInviting('new')}><MailPlus className="size-4" aria-hidden /> Invite employee</Button>} />
      <Dialog
        open={!!inviting}
        onClose={() => setInviting(null)}
        title={inviting && inviting !== 'new' ? `Invite ${inviting.fullName}` : 'Invite an employee'}
        description="They’ll get an email to set a password and join this workspace."
        wide
      >
        {inviting && <InviteForm employee={inviting === 'new' ? undefined : inviting} onDone={() => setInviting(null)} />}
      </Dialog>
    </>
  );
}
