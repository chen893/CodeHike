'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AppShellProps {
  children: React.ReactNode;
  activePath?: string;
}

export function AppShell({ children, activePath }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <SidebarContent activePath={activePath} />
      </aside>

      <button
        className="mobile-menu-btn"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        &#9776;
      </button>

      {drawerOpen && (
        <div className="drawer-overlay open" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <SidebarContent activePath={activePath} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="app-main">{children}</main>
    </div>
  );
}

function SidebarContent({
  activePath,
  onNavigate,
}: {
  activePath?: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="app-sidebar-logo">
        <Link href="/" onClick={onNavigate}>VibeDocs</Link>
      </div>
      <nav className="app-sidebar-nav">
        <Link
          href="/new"
          className={`app-sidebar-link${activePath === '/new' ? ' active' : ''}`}
          onClick={onNavigate}
        >
          + 新建教程
        </Link>
        <Link
          href="/"
          className={`app-sidebar-link${activePath === '/' ? ' active' : ''}`}
          onClick={onNavigate}
        >
          教程列表
        </Link>
      </nav>
    </>
  );
}
