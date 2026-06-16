/**
 * FEATURE-FIRST convention (see docs/REPOSITORY_STRUCTURE.md §4):
 * Each feature is a vertical slice under `features/<feature>/` holding its own
 * components, hooks, api-client, and zod schemas. A route page (app/(client)/leads)
 * stays thin and imports from here. Features must NOT reach into another feature's
 * internals — cross-feature sharing goes through `components/` or `@propulse/ui`.
 *
 * This is a placeholder table demonstrating the pattern (no real data fetching).
 */

interface LeadRow {
  id: string;
  name: string;
  stage: string;
  score: string;
}

const PLACEHOLDER_ROWS: LeadRow[] = [];

export function LeadsTable() {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="py-2">Name</th>
          <th className="py-2">Stage</th>
          <th className="py-2">Score</th>
        </tr>
      </thead>
      <tbody>
        {PLACEHOLDER_ROWS.length === 0 ? (
          <tr>
            <td className="py-4 text-muted" colSpan={3}>
              No leads yet — wire up @propulse/contracts + api-client.
            </td>
          </tr>
        ) : (
          PLACEHOLDER_ROWS.map((row) => (
            <tr key={row.id} className="border-b border-border">
              <td className="py-2">{row.name}</td>
              <td className="py-2">{row.stage}</td>
              <td className="py-2">{row.score}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
