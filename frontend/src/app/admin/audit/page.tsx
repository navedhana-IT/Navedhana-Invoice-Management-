'use client';
import { AuditView } from '@/features/audit/audit-view';

export default function Page() {
  return <AuditView path="/admin/audit-logs" description="Platform-wide activity across all companies." />;
}
