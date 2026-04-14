"use client"

import { useState } from "react"
import Link from "next/link"
import { Selectable, SelectionProvider } from "codehike/utils/selection"
import { MobileCodeFrame, SelectedCodeFrame } from "./scrolly-code-frame.jsx"
import { StepRail } from "./scrolly-step-rail.jsx"
import { ShareDialog } from "./share-dialog"
import { CreateCTA } from "./create-cta"

export function TutorialScrollyDemo({
  steps,
  intro,
  title,
  fileName,
  slug = undefined,
  showBreadcrumb = true,
}) {
  const [shareOpen, setShareOpen] = useState(false)
  return (
    <SelectionProvider
      className="grid min-h-screen bg-[#f7f8fa] text-slate-900 lg:grid-cols-[1.1fr_0.9fr] lg:gap-x-12 xl:gap-x-16"
      rootMargin="0% 0% -42% 0%"
    >
      <aside className="hidden min-h-screen border-r border-slate-200 bg-[#1e1e2e] lg:block">
        <div className="sticky top-0 flex h-screen items-start justify-center overflow-hidden">
          <SelectedCodeFrame steps={steps} fileName={fileName} />
        </div>
      </aside>

      <div className="relative min-h-screen bg-[#f7f8fa] px-6 pb-12 lg:px-0 lg:pb-0">
        <StepRail steps={steps} />

        {showBreadcrumb && (
          <nav className="flex items-center gap-2 px-4 py-6 text-xs text-slate-400 sm:px-8 sm:text-sm lg:px-12 lg:pt-10">
            {slug ? (
              <Link href="/" className="transition-colors hover:text-slate-900">
                VibeDocs
              </Link>
            ) : (
              <span className="cursor-default">VibeDocs</span>
            )}
            <span className="select-none text-slate-300">/</span>
            <span className="cursor-default transition-colors hover:text-slate-600">教程</span>
            <span className="select-none text-slate-300">/</span>
            <span className="max-w-[120px] truncate font-medium text-slate-900 sm:max-w-[240px]">
              {title || "教程"}
            </span>
          </nav>
        )}

        {slug && (
          <>
            <button
              onClick={() => setShareOpen(true)}
              className="fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-slate-700 hover:shadow-md lg:right-8 lg:top-8"
              aria-label="分享教程"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <ShareDialog
              slug={slug}
              title={title || ""}
              isOpen={shareOpen}
              onClose={() => setShareOpen(false)}
            />
          </>
        )}

        {intro ? (
          <section className="flex min-h-auto flex-col justify-center py-12 pl-4 sm:py-16 sm:pl-8 lg:min-h-screen lg:pl-12 lg:pr-16 lg:pb-24 lg:pt-16">
            <h1 className="text-5xl font-extrabold leading-tight text-slate-900 sm:text-6xl lg:text-7xl">
              {title || "教程渲染器"}
            </h1>
            <div className="mt-6">
              {intro.map((paragraph, index) => (
                <p
                  key={`intro-${index}`}
                  className="mt-4 w-full max-w-2xl text-lg leading-relaxed text-slate-500 sm:text-xl"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <div className="space-y-4">
          {steps.map((step, index) => (
            <Selectable
              key={step.id || `step-${index}`}
              index={index}
              selectOn={["click", "scroll"]}
              className="article-step scroll-mt-24 transition-all sm:pl-2 lg:flex lg:min-h-screen lg:items-start lg:pl-4 lg:pr-16"
            >
              <article className="w-full max-w-2xl py-12 pb-8 lg:py-20 lg:pb-32">
                {step.eyebrow && (
                  <p className="mb-4 text-xs font-bold uppercase text-[#2563eb]">
                    {step.eyebrow}
                  </p>
                )}
                <h2 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
                  {step.title}
                </h2>
                {step.lead && (
                  <p className="mt-8 text-lg font-medium leading-relaxed text-slate-800 sm:text-xl">
                    {step.lead}
                  </p>
                )}
                <div className="space-y-6">
                  {step.paragraphs.map((paragraph, paragraphIndex) => (
                    <p
                      key={`step-${index}-p-${paragraphIndex}`}
                      className="mt-6 text-base leading-relaxed text-slate-600 sm:text-lg"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
                <MobileCodeFrame 
                  step={step} 
                  fileName={fileName} 
                  index={index} 
                  total={steps.length} 
                />
              </article>
            </Selectable>
          ))}
          
          <div className="px-4 pb-24 pt-16 sm:px-2 lg:pl-4 lg:pr-16">
            <div className="max-w-2xl border-t border-slate-200 pt-16">
              <div className="mb-6 flex items-center gap-2 text-emerald-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold uppercase">教程学习完成</span>
              </div>

              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                干得漂亮！你已经完成了本教程。
              </h2>

              <p className="mt-6 text-lg text-slate-600">
                感谢阅读。希望这些步骤对你有所帮助，现在你可以继续探索或尝试自己创作一个教程。
              </p>

              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  href="/"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  返回首页
                </Link>
                <Link
                  href="/explore"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  发现更多
                </Link>
              </div>

              {slug && (
                <div className="mt-20">
                  <CreateCTA slug={slug} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SelectionProvider>
  )
}
