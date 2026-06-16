import Link from 'next/link';

// Landing placeholder. In production this redirects authenticated users to their
// dashboard (client) or console (admin); there is NO public signup.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Propulse AI</h1>
      <p className="text-muted">AI Operating System for Real Estate.</p>
      <Link href="/dashboard" className="text-primary underline">
        Go to dashboard
      </Link>
    </main>
  );
}
