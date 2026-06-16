import Link from 'next/link';

// Landing placeholder. In production this redirects authenticated users to their
// dashboard (client) or console (admin); there is NO public signup.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Propulse AI</h1>
        <p className="mt-2 text-slate-500">AI Operating System for Real Estate.</p>
      </div>
      <Link
        href="/demo"
        className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
      >
        ▶ See the live demo
      </Link>
      <Link href="/dashboard" className="text-sm text-slate-400 underline hover:text-slate-600">
        Go to dashboard (placeholder)
      </Link>
    </main>
  );
}
