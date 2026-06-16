import type { ReactNode } from 'react';
import { AppShell, type NavItem } from '@/components/app-shell';

// Super-admin / ops console nav. Platform roles span organizations (audited).
const ADMIN_NAV: NavItem[] = [
  { label: 'Organizations', href: '/organizations' },
  { label: 'Users', href: '/users' },
  { label: 'Audit Logs', href: '/audit-logs' },
  { label: 'System Health', href: '/system-health' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell title="Propulse Admin" navItems={ADMIN_NAV}>
      {children}
    </AppShell>
  );
}
