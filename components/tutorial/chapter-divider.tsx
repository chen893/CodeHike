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
        <div className="h-px flex-1 max-w-[40px] bg-border" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          第 {chapterIndex + 1} 章 / 共 {totalChapters} 章
        </span>
        <div className="h-px flex-1 bg-border/50" />
      </div>
      <h2 className="mt-4 text-2xl font-bold leading-tight text-foreground sm:text-3xl lg:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {description}
        </p>
      )}
    </div>
  )
}
