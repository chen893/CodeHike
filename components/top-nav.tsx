'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Compass,
  Tag,
  Files,
  Sparkles,
  Menu,
} from 'lucide-react';
import { LoginButton } from '@/components/auth/login-button';
import { UserMenu } from '@/components/auth/user-menu';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';

interface TopNavUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  id?: string | null;
  username?: string | null;
}

interface TopNavProps {
  user?: TopNavUser | null;
  activePath?: string;
  variant?: 'dark' | 'light';
}

const navItems = [
  { href: '/', label: '首页', icon: BookOpen },
  { href: '/explore', label: '探索', icon: Compass },
  { href: '/tags', label: '标签', icon: Tag },
  { href: '/drafts', label: '草稿箱', icon: Files },
] as const;

export function TopNav({ user, activePath, variant = 'light' }: TopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 h-14 transition-all duration-200 ${
          variant === 'light'
            ? scrolled
              ? 'border-b border-slate-200 bg-white/95 backdrop-blur-xl shadow-sm'
              : 'border-b border-slate-100 bg-white/80 backdrop-blur-lg'
            : scrolled
              ? 'border-b border-slate-700/40 bg-[#0c1021]/95 backdrop-blur-xl shadow-lg shadow-black/20'
              : 'border-b border-slate-700/20 bg-[#0c1021]/80 backdrop-blur-lg'
        }`}
      >
        <nav className="container-app flex h-full items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="group flex items-center gap-2 transition-opacity hover:opacity-90"
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${
              variant === 'light' ? 'bg-slate-900' : 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20'
            }`}>
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
            </div>
            <span className={`font-mono text-[13px] font-bold tracking-tight ${variant === 'light' ? 'text-slate-800 group-hover:text-slate-900' : 'text-slate-200 group-hover:text-white'}`}>
              vibedocs
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-0.5 lg:flex">
            {navItems.map((item) => {
              const active = activePath === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[12px] font-medium transition-all duration-150 ${
                    active
                      ? variant === 'light' ? 'text-cyan-600' : 'text-cyan-300'
                      : variant === 'light'
                        ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                  }`}
                >
                  <Icon size={14} className={active ? (variant === 'light' ? 'text-cyan-600' : 'text-cyan-400') : (variant === 'light' ? 'text-slate-400' : 'text-slate-500')} />
                  <span>{item.label}</span>
                  {active && (
                    <span className={`absolute -top-px left-3 right-3 h-px bg-gradient-to-r from-transparent ${variant === 'light' ? 'via-cyan-500' : 'via-cyan-400'} to-transparent`} />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Desktop right actions */}
          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/new"
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold text-white whitespace-nowrap transition-all active:scale-[0.97] ${variant === 'light' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-[0_0_16px_rgba(16,185,129,0.15)] hover:brightness-110'}`}
            >
              <Sparkles size={12} className="shrink-0" />
              新建教程
            </Link>
            {user ? (
              <UserMenu user={user} variant={variant} />
            ) : (
              <LoginButton variant="ghost" />
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors lg:hidden ${variant === 'light' ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
            onClick={() => setMobileOpen(true)}
            aria-label="打开菜单"
          >
            <Menu size={18} />
          </button>
        </nav>
      </header>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          className={`w-72 border-l ${
            variant === 'light'
              ? 'border-slate-200 bg-white text-slate-800'
              : 'border-slate-700/50 bg-[#0c1021] text-slate-100'
          }`}
        >
          <SheetTitle className="sr-only">导航菜单</SheetTitle>

          {/* Header */}
          <div className={`flex items-center gap-2 border-b pb-3 ${variant === 'light' ? 'border-slate-100' : 'border-slate-700/30'}`}>
            {variant === 'light' ? (
              <>
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-white">
                    <path d="m16 18 6-6-6-6" />
                    <path d="M8 6 2 12l6 6" />
                    <path d="m12 18-2-12" />
                  </svg>
                </div>
                <span className="font-mono text-[12px] font-bold text-slate-800">
                  vibedocs
                </span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-400/60" />
                  <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                </div>
                <span className="font-mono text-[11px] font-bold text-slate-300">vibedocs</span>
                <span className="font-mono text-[9px] text-slate-700">~/nav</span>
              </>
            )}
          </div>

          {/* Nav links */}
          <nav className="mt-4 space-y-px" aria-label="Mobile navigation">
            <div className={`mb-2 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest ${variant === 'light' ? 'text-slate-400' : 'text-slate-600'}`}>
              browse
            </div>
            {navItems.map((item) => {
              const active = activePath === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                    active
                      ? variant === 'light'
                        ? 'bg-cyan-50 text-cyan-600'
                        : 'bg-cyan-400/[0.08] text-cyan-300'
                      : variant === 'light'
                        ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  {active && (
                    <div className={`absolute bottom-1 left-0 top-1 w-[2px] rounded-r-full ${
                      variant === 'light' ? 'bg-cyan-500' : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.5)]'
                    }`} />
                  )}
                  <Icon
                    size={15}
                    className={active ? (variant === 'light' ? 'text-cyan-500' : 'text-cyan-400') : (variant === 'light' ? 'text-slate-400 group-hover:text-slate-600' : 'text-slate-600 group-hover:text-slate-400')}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <div className={`mt-4 mb-2 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest ${variant === 'light' ? 'text-slate-400' : 'text-slate-600'}`}>
              actions
            </div>
            <Link
              href="/new"
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                variant === 'light'
                  ? 'text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700'
                  : 'text-emerald-400 hover:bg-emerald-900/20 hover:text-emerald-300'
              }`}
            >
              <Sparkles size={15} className={variant === 'light' ? 'text-cyan-500' : 'text-emerald-500'} />
              <span>新建教程</span>
            </Link>
          </nav>

          {/* Auth section */}
          <div className={`mt-auto border-t pt-4 ${variant === 'light' ? 'border-slate-100' : 'border-slate-700/40'}`}>
            {user ? (
              <UserMenu user={user} variant={variant} />
            ) : (
              <div className="space-y-2">
                {variant === 'light' ? (
                  <p className="text-[12px] text-slate-400">
                    登录后可创建和编辑教程
                  </p>
                ) : (
                  <p className="font-mono text-[10px] text-slate-500">
                    <span className="text-amber-400/60">$</span> login to create & edit
                  </p>
                )}
                <LoginButton />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
