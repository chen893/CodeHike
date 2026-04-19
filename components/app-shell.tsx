'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Files,
  BookOpen,
  Compass,
  Tag,
  Sparkles,
  Heart,
} from 'lucide-react';
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
  { href: '/', label: '首页', icon: BookOpen, hint: '~/' },
  { href: '/explore', label: '探索', icon: Compass, hint: '/explore' },
  { href: '/tags', label: '标签', icon: Tag, hint: '/tags' },
  { href: '/following', label: '我的关注', icon: Heart, hint: '/following' },
  { href: '/drafts', label: '草稿箱', icon: Files, hint: '/drafts' },
] as const;

const actionItems = [
  { href: '/new', label: '新建教程', icon: Sparkles, hint: '$ new' },
] as const;

export function AppShell({ children, activePath, user }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background text-foreground">

      <aside className="sticky left-0 top-0 z-20 hidden h-screen w-60 shrink-0 border-r border-slate-700/50 bg-[#0c1021] text-slate-100 lg:fixed lg:flex lg:flex-col">
        {/* Subtle top-down ambient glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cyan-950/20 to-transparent" />
        <div className="relative z-10 flex h-full flex-col">
          <SidebarContent activePath={activePath} user={user} />
        </div>
      </aside>

      <button
        type="button"
        className="fixed left-4 top-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-700/50 bg-[#0c1021] font-mono text-sm text-slate-400 shadow-lg shadow-black/30 transition-all hover:border-slate-600 hover:text-cyan-400 active:scale-95 lg:hidden"
        onClick={() => setDrawerOpen(true)}
        aria-label="打开菜单"
        aria-expanded={drawerOpen}
      >
        <span className="text-base leading-none">$_</span>
      </button>

      <div
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-md transition-opacity duration-300 lg:hidden ${
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      >
        <div
          className={`absolute left-0 top-0 h-full w-72 border-r border-slate-700/50 bg-[#0c1021] text-slate-100 shadow-2xl shadow-cyan-950/20 transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Subtle ambient glow for mobile drawer too */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cyan-950/20 to-transparent" />
          <div className="relative z-10 h-full">
            <SidebarContent activePath={activePath} user={user} onNavigate={() => setDrawerOpen(false)} />
          </div>
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
    <div className="flex h-full flex-col">
      {/* ── Sidebar Header: mini terminal title bar ── */}
      <Link
        href="/"
        className="group flex items-center gap-2.5 border-b border-slate-700/30 px-4 py-2.5 transition-colors hover:bg-slate-800/40"
        onClick={onNavigate}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400/60" />
          <span className="h-2 w-2 rounded-full bg-amber-400/60" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
        </div>
        <span className="font-mono text-[13px] font-bold tracking-tight text-slate-200 group-hover:text-white">
          vibedocs
        </span>
        <span className="font-mono text-[9px] text-slate-700">~/workspace</span>
      </Link>

      {/* Active path breadcrumb row */}
      <div className="border-b border-slate-700/20 px-4 py-1.5">
        <span className="font-mono text-[10px] text-slate-600">
          <span className="text-emerald-500/50">$</span>{' '}
          <span className="text-slate-400">
            cd {activePath === '/' ? '~' : activePath}
          </span>
        </span>
      </div>

      {/* ── Navigation: file-tree style ── */}
      <nav className="mt-3 flex-1 overflow-y-auto px-3" aria-label="Main navigation">
        {/* Section label */}
        <div className="mb-1 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-slate-600">
          // browse
        </div>
        <div className="space-y-px">
          {navItems.map((item) => {
            const active = activePath === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-1 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1021] ${
                  active
                    ? 'bg-cyan-400/[0.08] text-cyan-300'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                {/* Active: full-height left bar | Inactive hover: subtle ghost bar */}
                {active ? (
                  <div className="absolute bottom-1 left-0 top-1 w-[2px] rounded-r-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                ) : (
                  <div className="absolute bottom-2 left-0 top-2 w-[2px] rounded-r-full bg-slate-600 opacity-0 transition-opacity duration-150 group-hover:opacity-40" />
                )}
                <Icon
                  size={15}
                  className={`shrink-0 transition-colors duration-150 ${
                    active
                      ? 'text-cyan-400'
                      : 'text-slate-600 group-hover:text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
                <span className={`ml-auto font-mono text-[9px] ${active ? 'text-cyan-500/50' : 'text-slate-700 group-hover:text-slate-500'}`}>
                  {item.hint}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Actions section */}
        <div className="mt-4 mb-1 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-slate-600">
          // actions
        </div>
        <div className="space-y-px">
          {actionItems.map((item) => {
            const active = activePath === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-1 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1021] ${
                  active
                    ? 'bg-emerald-400/[0.08] text-emerald-300'
                    : 'text-slate-400 hover:bg-emerald-900/20 hover:text-emerald-200'
                }`}
              >
                {/* Hover ghost bar for actions */}
                <div className="absolute bottom-2 left-0 top-2 w-[2px] rounded-r-full bg-emerald-700 opacity-0 transition-opacity duration-150 group-hover:opacity-40" />
                <Icon
                  size={15}
                  className={`shrink-0 transition-colors duration-150 ${
                    active
                      ? 'text-emerald-400'
                      : 'text-emerald-600 group-hover:text-emerald-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
                <span className={`ml-auto font-mono text-[9px] ${active ? 'text-emerald-500/50' : 'text-slate-700 group-hover:text-emerald-500/60'}`}>
                  {item.hint}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Bottom: auth + status bar ── */}
      <div className="mt-auto">
        {/* Auth section */}
        <div className="border-t border-slate-700/40 px-4 py-3">
          {user ? (
            <UserMenu user={user} />
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-[10px] leading-relaxed text-slate-500">
                <span className="text-amber-400/60">$</span> login to create & edit
              </p>
              <LoginButton />
            </div>
          )}
        </div>

        {/* Status bar -- mimics VS Code bottom bar */}
        <div className="flex items-center gap-2 border-t border-slate-700/30 bg-slate-950/50 px-4 py-1.5">
          <span className="flex items-center gap-1.5 rounded-sm bg-cyan-600/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-cyan-400/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.6)]" />
            ONLINE
          </span>
          <span className="font-mono text-[9px] text-slate-600">v1.0</span>
          <span className="ml-auto font-mono text-[9px] text-slate-700">
            utf-8
          </span>
        </div>
      </div>
    </div>
  );
}
