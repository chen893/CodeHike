'use client'

import { signIn } from 'next-auth/react'

export function LoginButton() {
  return (
    <button
      onClick={() => signIn('github')}
      className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
    >
      GitHub 登录
    </button>
  )
}
