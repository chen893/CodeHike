'use client'

import { signOut } from 'next-auth/react'

interface UserMenuProps {
  user: { name?: string | null; email?: string | null; image?: string | null }
}

export function UserMenu({ user }: UserMenuProps) {
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
        <span className="truncate text-sm font-semibold text-slate-100">
          {user.name || user.email?.split('@')[0]}
        </span>
        <button
          onClick={() => signOut()}
          className="w-fit text-xs font-medium text-slate-400 transition-colors hover:text-cyan-400"
        >
          安全退出
        </button>
      </div>
    </div>
  )
}
