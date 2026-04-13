"use client"

import { useState, useCallback } from "react"
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Share2, Copy, Check } from "lucide-react"

interface ShareDialogProps {
  slug: string
  title: string
  isOpen: boolean
  onClose: () => void
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for insecure contexts
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={`复制${label}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" />
          已复制
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          复制
        </>
      )}
    </button>
  )
}

export function ShareDialog({ slug, title, isOpen, onClose }: ShareDialogProps) {
  const [copiedLink, setCopiedLink] = useState(false)

  if (typeof window === "undefined") return null

  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
  const publicUrl = `${baseUrl}/${slug}`
  const embedSrc = `${baseUrl}/api/tutorials/${slug}/embed`
  const embedSnippet = `<iframe src="${embedSrc}" width="100%" height="600" frameborder="0"></iframe>`
  const twitterText = encodeURIComponent(`${title} — ${publicUrl}`)
  const twitterUrl = `https://twitter.com/intent/tweet?text=${twitterText}`

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          分享教程
        </DialogTitle>
        <DialogDescription>分享「{title}」给更多人</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* Public URL */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">公开链接</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border/50 bg-muted/50 px-3 py-2 text-xs">
              {publicUrl}
            </code>
            <CopyButton text={publicUrl} label="链接" />
          </div>
        </div>

        {/* Embed Snippet */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">嵌入代码</label>
          <div className="rounded-md border border-border/50 bg-muted/50 p-3">
            <code className="block break-all text-xs leading-relaxed">
              {embedSnippet}
            </code>
          </div>
          <div className="mt-2">
            <CopyButton text={embedSnippet} label="嵌入代码" />
          </div>
        </div>

        {/* Social share */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">社交分享</label>
          <div className="flex gap-2">
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border/50 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              分享到 X
            </a>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl)
                  setCopiedLink(true)
                  setTimeout(() => setCopiedLink(false), 2000)
                } catch {
                  // silent
                }
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border/50 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              {copiedLink ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  已复制链接
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  复制链接
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
