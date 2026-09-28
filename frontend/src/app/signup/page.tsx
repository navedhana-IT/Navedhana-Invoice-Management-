import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { SignupWizard } from '@/features/signup/wizard';
import { getPlans, pageMeta } from '@/lib/seo';

export const metadata = pageMeta('Start your free trial', 'Create your Navedhana Ledger workspace: company, first brand, branding and invoice numbering in a few minutes.', '/signup');

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const [{ plan }, plans] = await Promise.all([searchParams, getPlans()]);
  return (
    <AuthShell
      wide
      title="Create your workspace"
      subtitle={<>Set up your company and first brand. No credit card needed. <Link href="/pricing" className="font-medium text-primary hover:underline">Compare plans</Link></>}
    >
      <SignupWizard plans={plans ?? []} initialPlan={plan} />
    </AuthShell>
  );
}
