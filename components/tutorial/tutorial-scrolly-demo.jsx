"use client"

import { useState } from "react"
import { Selectable, SelectionProvider } from "codehike/utils/selection"
import { MobileCodeFrame, SelectedCodeFrame } from "./scrolly-code-frame.jsx"
import { StepRail } from "./scrolly-step-rail.jsx"
import { ShareDialog } from "./share-dialog"

export function TutorialScrollyDemo({
  steps,
  intro,
  title,
  fileName,
  slug = undefined,
}) {
  const [shareOpen, setShareOpen] = useState(false)
  return (
    <SelectionProvider
      className="grid min-h-screen bg-[#f7f8fa] text-slate-900 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]"
      rootMargin="0% 0% -42% 0%"
    >
      <aside className="hidden min-h-screen bg-[#1e1e2e] lg:block">
        <div className="sticky top-0 flex h-screen items-start justify-center overflow-hidden">
          <SelectedCodeFrame steps={steps} fileName={fileName} />
        </div>
      </aside>

      <div className="relative min-h-screen bg-[#f7f8fa] px-5 pb-10 lg:px-0 lg:pb-0">
        <StepRail steps={steps} />

        {slug && (
          <>
            <button
              onClick={() => setShareOpen(true)}
              className="fixed right-4 top-4 z-40 rounded-full border border-slate-200 bg-white/80 p-2.5 text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-slate-700 hover:shadow-md lg:right-6 lg:top-6"
              aria-label="分享教程"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <section className="flex min-h-auto flex-col justify-center py-9 pl-4 sm:py-10 sm:pl-8 lg:min-h-screen lg:pl-10 lg:pr-14 lg:pb-[72px] lg:pt-12">
            <h1 className="text-[clamp(2.625rem,5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-slate-900">
              {title || "Tutorial renderer"}
            </h1>
            <div className="mt-4">
              {intro.map((paragraph, index) => (
                <p
                  key={`intro-${index}`}
                  className="mt-4 w-full max-w-[600px] text-[clamp(1rem,1.4vw,1.1875rem)] leading-[1.75] text-slate-500"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <div>
          {steps.map((step, index) => (
            <Selectable
              key={step.id || `step-${index}`}
              index={index}
              selectOn={["click", "scroll"]}
              className="article-step scroll-mt-24 border-l-2 border-slate-200 pl-5 transition-colors data-[selected=true]:border-[#2563eb] sm:pl-8 lg:flex lg:min-h-screen lg:items-start lg:pl-10 lg:pr-14"
            >
              <article className="w-full max-w-[560px] py-9 pb-7 lg:py-14 lg:pb-[120px]">
                {step.eyebrow && (
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#2563eb]">
                    {step.eyebrow}
                  </p>
                )}
                <h2 className="text-[clamp(1.75rem,2.8vw,2.75rem)] font-bold leading-[1.15] tracking-[-0.025em] text-slate-900">
                  {step.title}
                </h2>
                {step.lead && (
                  <p className="mt-6 max-w-[560px] text-[clamp(1rem,1.3vw,1.125rem)] font-medium leading-[1.6] text-slate-900">
                    {step.lead}
                  </p>
                )}
                <div>
                  {step.paragraphs.map((paragraph, paragraphIndex) => (
                    <p
                      key={`step-${index}-p-${paragraphIndex}`}
                      className="mt-5 max-w-[560px] text-[clamp(0.9375rem,1.2vw,1.0625rem)] leading-[1.8] text-slate-500"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
                <MobileCodeFrame step={step} fileName={fileName} />
              </article>
            </Selectable>
          ))}
        </div>
      </div>
    </SelectionProvider>
  )
}
