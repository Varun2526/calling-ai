import type { ReactNode } from 'react';
import { AppShell, type NavItem } from '@/components/app-shell';

// Tenant-facing dashboard nav (see docs/PRODUCT_OVERVIEW.md §7 module map).
const CLIENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Leads', href: '/leads' },
  { label: 'Conversations', href: '/conversations' },
  { label: 'Calls', href: '/calls' },
  { label: 'Appointments', href: '/appointments' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Documents', href: '/documents' },
  { label: 'Settings', href: '/settings' },
];

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell title="Propulse AI" navItems={CLIENT_NAV}>
      {children}
    </AppShell>
  );
}
