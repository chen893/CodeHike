'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface SelectionMenuPosition {
  x: number
  y: number
}

interface CodeSelectionMenuProps {
  containerRef: React.RefObject<HTMLElement | null>
  onSetPatchFind: (text: string) => void
}

export function CodeSelectionMenu({ containerRef, onSetPatchFind }: CodeSelectionMenuProps) {
  const [position, setPosition] = useState<SelectionMenuPosition | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const handleMouseUp = useCallback(() => {
    // Small delay to let the browser finalize selection
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setPosition(null)
        return
      }

      // Check if selection is within our container
      const container = containerRef.current
      if (!container || !container.contains(selection.anchorNode)) {
        return
      }

      const text = selection.toString().trim()
      if (!text) {
        setPosition(null)
        return
      }

      // Get position from selection range
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      setSelectedText(text)
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,  // above the selection
      })
    }, 10)
  }, [containerRef])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDownOutside)

    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDownOutside)
    }
  }, [containerRef, handleMouseUp])

  function handleMouseDownOutside(e: MouseEvent) {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setPosition(null)
      window.getSelection()?.removeAllRanges()
    }
  }

  function handleAction(callback: (text: string) => void) {
    callback(selectedText)
    setPosition(null)
    window.getSelection()?.removeAllRanges()
  }

  if (!position) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <button
        type="button"
        className="whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 transition-colors"
        onClick={() => handleAction(onSetPatchFind)}
      >
        设为 Patch Find
      </button>
    </div>
  )
}
