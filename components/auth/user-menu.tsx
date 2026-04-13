'use client'

import { signOut } from 'next-auth/react'

interface UserMenuProps {
  user: { name?: string | null; email?: string | null; image?: string | null }
}

export function UserMenu({ user }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      {user.image && (
        <img
          src={user.image}
          alt={user.name || ''}
          className="h-8 w-8 rounded-full"
        />
      )}
      <span className="text-sm text-slate-600">
        {user.name || user.email}
      </span>
      <button
        onClick={() => signOut()}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        登出
      </button>
    </div>
  )
}
