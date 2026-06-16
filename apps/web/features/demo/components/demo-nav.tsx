import Link from 'next/link';

/** Tabs to switch between the chat and voice agent previews. */
export function DemoNav({ active }: { active: 'chat' | 'voice' }) {
  const tab = (href: string, label: string, key: 'chat' | 'voice') => (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
        active === key
          ? 'bg-emerald-600 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mb-5 flex gap-2">
      {tab('/demo', '💬 Chat agent', 'chat')}
      {tab('/demo/voice', '📞 Voice agent', 'voice')}
    </nav>
  );
}
