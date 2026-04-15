interface ChapterDividerProps {
  title: string
  description?: string
  chapterIndex: number
  totalChapters: number
}

export function ChapterDivider({ title, description, chapterIndex, totalChapters }: ChapterDividerProps) {
  return (
    <div className="chapter-divider py-10 pl-4 sm:pl-8 lg:pl-12 lg:pr-16">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 max-w-[40px] bg-slate-300" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
          第 {chapterIndex + 1} 章 / 共 {totalChapters} 章
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <h2 className="mt-4 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl lg:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed text-slate-500 sm:text-lg">
          {description}
        </p>
      )}
    </div>
  )
}
