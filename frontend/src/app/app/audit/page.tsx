'use client';
import { AuditView } from '@/features/audit/audit-view';

export default function Page() {
  return <AuditView path="/audit-logs" description="Every change in this company, append-only." />;
}
