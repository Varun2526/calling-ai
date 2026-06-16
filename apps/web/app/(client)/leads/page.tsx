import { LeadsTable } from '@/features/leads/components/leads-table';

// Thin route page — delegates UI to the leads feature slice (feature-first).
export default function LeadsPage() {
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">Leads</h1>
      <LeadsTable />
    </section>
  );
}
