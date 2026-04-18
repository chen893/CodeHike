'use client'

import { Suspense } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { basePath, withBasePath } from '@/lib/base-path'

function SignInPageContent() {
  const searchParams = useSearchParams()
  const rawCallbackUrl = searchParams.get('callbackUrl')
  const callbackUrl =
    rawCallbackUrl && /^https?:\/\//.test(rawCallbackUrl)
      ? rawCallbackUrl
      : rawCallbackUrl && basePath && rawCallbackUrl.startsWith(`${basePath}/`)
        ? rawCallbackUrl
        : withBasePath(rawCallbackUrl || '/')

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_var(--primary)/0.06,_transparent_40%)]" />

      <div className="relative z-10 w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center space-y-2">
          <Link href="/" className="group flex items-center space-x-2 transition-opacity hover:opacity-80">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
              >
                <path d="m16 18 6-6-6-6" />
                <path d="M8 6 2 12l6 6" />
                <path d="m12 18-2-12" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-foreground">
              VibeDocs
            </span>
          </Link>
          <p className="mt-4 text-muted-foreground">
            登录后可以创建、编辑和发布源码教程。
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <div className="space-y-6">
            <button
              onClick={() => signIn('github', { callbackUrl })}
              className="group relative flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
              style={{ minHeight: '44px' }}
            >
              <svg
                className="h-5 w-5 fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>使用 GitHub 账号登录</span>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  或
                </span>
              </div>
            </div>

            <button
              onClick={() => signIn('linuxdo', { callbackUrl })}
              className="group relative flex w-full items-center justify-center gap-3 rounded-lg bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground transition-all hover:bg-secondary/80 active:scale-[0.98]"
              style={{ minHeight: '44px' }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>使用 Linux.do 账号登录</span>
            </button>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              认证完成后会回到你刚才的页面，未指定时默认回到首页。
            </p>
          </div>
        </div>

        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2 h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            返回首页
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  )
}
