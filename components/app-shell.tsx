'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Files, BookOpen, Terminal, Compass, Tag } from 'lucide-react';
import { LoginButton } from '@/components/auth/login-button';
import { UserMenu } from '@/components/auth/user-menu';

interface AppShellUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  id?: string | null;
  username?: string | null;
}

interface AppShellProps {
  children: React.ReactNode;
  activePath?: string;
  user?: AppShellUser | null;
}

const navItems = [
  { href: '/', label: '首页', icon: BookOpen },
  { href: '/explore', label: '探索', icon: Compass },
  { href: '/tags', label: '标签', icon: Tag },
  { href: '/drafts', label: '草稿箱', icon: Files },
  { href: '/new', label: '新建', icon: PlusCircle },
] as const;

export function AppShell({ children, activePath, user }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.08),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#f1f5f9_100%)]" />

      <aside className="sticky left-0 top-0 z-20 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-slate-900 text-slate-100 lg:fixed lg:flex lg:flex-col">
        <SidebarContent activePath={activePath} user={user} />
      </aside>

      <button
        type="button"
        className="fixed left-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-md transition-all hover:bg-slate-50 active:scale-95 lg:hidden"
        onClick={() => setDrawerOpen(true)}
        aria-label="打开菜单"
        aria-expanded={drawerOpen}
      >
        <span className="text-2xl leading-none">☰</span>
      </button>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      >
        <div
          className={`absolute left-0 top-0 h-full w-72 border-r border-slate-800 bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <SidebarContent activePath={activePath} user={user} onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>

      <main className="relative min-h-screen lg:pl-60">{children}</main>
    </div>
  );
}

function SidebarContent({
  activePath,
  user,
  onNavigate,
}: {
  activePath?: string;
  user?: AppShellUser | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-6 px-2 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold text-white transition hover:opacity-90"
          onClick={onNavigate}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500 text-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.5)]">
            <Terminal size={20} />
          </div>
          VibeDocs
        </Link>
        <p className="mt-2.5 text-[10px] font-bold uppercase text-slate-500">
          教程工作台
        </p>
      </div>

      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const active = activePath === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex items-center gap-3.5 rounded-lg px-3 py-3 text-sm font-semibold transition-all ${
                active
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              {active && (
                <div className="absolute left-0 h-5 w-1 rounded-r-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
              <Icon
                size={20}
                className={`transition-colors duration-200 ${
                  active ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-4">
          {user ? (
            <UserMenu user={user} />
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-slate-400">
                登录后可创建和编辑教程
              </p>
              <LoginButton />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-2 text-[10px] font-bold text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          运行正常
        </div>
      </div>
    </div>
  );
}
