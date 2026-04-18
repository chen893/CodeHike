'use client'

import Link from 'next/link'

export function LoginButton() {
  return (
    <Link
      href="/auth/signin"
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
    >
      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
        <path d="M12 10.333 6.517 16.24a.678.678 0 0 1-.922.047l-.036-.036a.678.678 0 0 1 .047-.922L12 8.667l6.394 6.662a.678.678 0 0 1 .047.922l-.036.036a.678.678 0 0 1-.922-.047L12 10.333zM22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10zm-1.5 0a8.5 8.5 0 1 0-17 0 8.5 8.5 0 0 0 17 0z" />
      </svg>
      登录
    </Link>
  )
}
