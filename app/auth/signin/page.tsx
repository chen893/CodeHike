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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-[360px]">
        {/* Logo + tagline */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-white"
              >
                <path d="m16 18 6-6-6-6" />
                <path d="M8 6 2 12l6 6" />
                <path d="m12 18-2-12" />
              </svg>
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-slate-900">
              VibeDocs
            </span>
          </Link>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            登录后可以创建、编辑和发布源码教程
          </p>
        </div>

        {/* Auth card */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {/* Thin accent stripe */}
          <div className="h-[2px] bg-slate-900" />

          <div className="p-5">
            <div className="space-y-3">
              {/* GitHub */}
              <button
                onClick={() => signIn('github', { callbackUrl })}
                className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
                style={{ minHeight: '44px' }}
              >
                <svg
                  className="h-[18px] w-[18px] shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    fill="currentColor"
                  />
                </svg>
                使用 GitHub 登录
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-0.5">
                <div className="flex-1 border-t border-slate-100" />
                <span className="text-[11px] text-slate-400">或</span>
                <div className="flex-1 border-t border-slate-100" />
              </div>

              {/* Linux.do */}
              <button
                onClick={() => signIn('linuxdo', { callbackUrl })}
                className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
                style={{ minHeight: '44px' }}
              >
                <svg
                  className="h-[18px] w-[18px] shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                使用 Linux.do 登录
              </button>
            </div>
          </div>
        </div>

        {/* Help text */}
        <p className="mt-4 text-center text-[11px] text-slate-400">
          认证完成后会回到你刚才的页面
        </p>

        {/* Back link */}
        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-slate-400 transition-colors hover:text-slate-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
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
