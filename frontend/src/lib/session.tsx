'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, logout as apiLogout, getAccessToken, refreshSession, tenant } from './api';
import { disconnectRealtime } from './realtime';
import type { Id } from './ids';

export type Me = {
  id: Id; email: string; fullName: string; phone: string | null; isMasterAdmin: boolean; emailNotifications: boolean;
  memberships: { company: { id: Id; slug: string; displayName: string }; roles: { role: { name: string } }[] }[];
};
/** Where to land after signing in: platform admins without a company go to the admin console. */
export const homeFor = (me: Me) => (me.isMasterAdmin && me.memberships.length === 0 ? '/admin' : '/app');

export type Ctx = {
  company: {
    id: Id; slug: string; legalName: string; displayName: string; status: string; timezone: string;
    subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'EXPIRED'; trialEndsAt: string | null;
    /** Trial or subscription lapsed: writes are rejected with 402 until renewed. */
    readOnly: boolean;
    plan: { code: string; name: string; features: string[]; limits: Record<string, number | boolean | null> } | null;
  };
  services: { id: Id; slug: string; name: string; displayName: string | null; logoKey: string | null; code: string; state: string | null }[];
  permissions: string[];
  isMasterAdmin: boolean;
};

type Session = {
  me: Me;
  companyId: Id | null;
  serviceId: Id | null;
  ctx?: Ctx;
  setCompany: (id: Id) => void;
  setService: (id: Id | null) => void;
  can: (perm: string) => boolean;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

/** Restores the session from the refresh cookie, then loads /me and the tenant context (UI hints only). */
export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [companyId, setCompanyId] = useState<Id | null>(null);
  const [serviceId, setServiceId] = useState<Id | null>(null);

  useEffect(() => {
    // After login/signup/invite the token is already in memory; refreshing again would only rotate it.
    (getAccessToken() ? Promise.resolve(true) : refreshSession()).then((ok) => {
      if (!ok) return router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
      setCompanyId(tenant.companyId);
      setServiceId(tenant.serviceId);
      setReady(true);
    });
  }, [router]);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), enabled: ready });

  useEffect(() => {
    const first = me.data?.memberships[0]?.company.id;
    if (!companyId && first) {
      tenant.setCompany(first);
      setCompanyId(first);
    }
  }, [me.data, companyId]);

  const ctx = useQuery({ queryKey: ['ctx', companyId, serviceId], queryFn: () => api<Ctx>('/me/context'), enabled: ready && !!companyId });

  const setCompany = useCallback((id: Id) => {
    tenant.setCompany(id);
    setCompanyId(id);
    setServiceId(null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  }, [qc]);

  const setService = useCallback((id: Id | null) => {
    tenant.setService(id);
    setServiceId(id);
    qc.invalidateQueries();
  }, [qc]);

  const logout = useCallback(async () => {
    await apiLogout();
    disconnectRealtime();
    qc.clear();
    router.replace('/login');
  }, [qc, router]);

  if (!ready || !me.data) return <>{fallback}</>;
  const perms = new Set(ctx.data?.permissions ?? []);
  return (
    <SessionContext.Provider
      value={{ me: me.data, companyId, serviceId, ctx: ctx.data, setCompany, setService, can: (p) => perms.has(p), logout }}
    >
      {children}
    </SessionContext.Provider>
  );
}
