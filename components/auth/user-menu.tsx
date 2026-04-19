'use client'

import { signOut } from 'next-auth/react'

interface UserMenuProps {
  user: { name?: string | null; email?: string | null; image?: string | null }
  variant?: 'dark' | 'light'
}

export function UserMenu({ user, variant = 'dark' }: UserMenuProps) {
  const nameColor = variant === 'light' ? 'text-slate-800' : 'text-slate-100'
  const signOutColor = variant === 'light'
    ? 'text-slate-400 hover:text-slate-600'
    : 'text-slate-400 hover:text-cyan-400'

  return (
    <div className="flex items-center gap-3 w-full overflow-hidden">
      {user.image && (
        <img
          src={user.image}
          alt={user.name || ''}
          className="h-9 w-9 shrink-0 rounded-full border border-border shadow-sm"
        />
      )}
      <div className="flex flex-1 flex-col min-w-0">
        <span className={`truncate text-sm font-semibold ${nameColor}`}>
          {user.name || user.email?.split('@')[0]}
        </span>
        <button
          onClick={() => signOut()}
          className={`w-fit text-xs font-medium transition-colors ${signOutColor}`}
        >
          安全退出
        </button>
      </div>
    </div>
  )
}
