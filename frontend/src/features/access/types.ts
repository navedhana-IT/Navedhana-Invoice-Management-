import type { Id } from '@/lib/ids';
export type Role = { id: Id; key: string; name: string; description: string | null; permissions: string[]; allServices: boolean; isSystem: boolean; companyId: Id | null; _count: { members: number } };

export type Invitation = {
  id: Id; email: string; fullName: string; phone: string | null; status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  roleIds: Id[]; serviceIds: Id[]; expiresAt: string; createdAt: string;
};

export type Member = {
  id: Id; status: string; createdAt: string;
  user: { id: Id; email: string; fullName: string; phone: string | null; lastLoginAt: string | null };
  roles: { serviceId: Id | null; role: { id: Id; key: string; name: string } }[];
  serviceAssignments: { serviceId: Id }[];
};
