import type { ReactNode } from 'react';

/**
 * Shared, feature-agnostic app shell (placeholder).
 * Composes a nav + content region; the route-group layouts pass the nav items
 * that belong to their audience (client dashboard vs. super-admin console).
 * Real navigation/active-state/auth wiring comes later.
 */
export interface NavItem {
  label: string;
  href: string;
}

export interface AppShellProps {
  title: string;
  navItems: NavItem[];
  children: ReactNode;
}

export function AppShell({ title, navItems, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r border-border p-4">
        <div className="mb-6 text-lg font-semibold">{title}</div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded px-2 py-1 text-sm hover:bg-border/40"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
