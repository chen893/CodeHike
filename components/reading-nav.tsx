import Link from 'next/link';

interface ReadingNavProps {
  slug: string;
  title?: string;
}

export function ReadingNav({ slug, title }: ReadingNavProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-700/20 bg-[#0c1021]/88 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        {/* Left: logo + back */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="group flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 transition-opacity hover:opacity-90"
            aria-label="返回首页"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-white"
            >
              <path d="m16 18 6-6-6-6" />
              <path d="M8 6 2 12l6 6" />
              <path d="m12 18-2-12" />
            </svg>
          </Link>
          <Link
            href="/explore"
            className="flex items-center gap-1.5 font-mono text-[12px] text-slate-400 transition-colors hover:text-slate-200"
          >
            <span className="text-slate-600">&larr;</span>
            <span>返回</span>
          </Link>
        </div>

        {/* Right: truncated title */}
        {title && (
          <span className="hidden max-w-xs truncate font-mono text-[11px] text-slate-500 sm:block">
            {title}
          </span>
        )}
      </div>
    </header>
  );
}
