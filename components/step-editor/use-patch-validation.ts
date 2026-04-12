'use client'

import { useState, useEffect, useMemo } from 'react'
import type { PatchValidationState } from './types'
import { classifyPatchValidation } from './diff-utils'

interface PatchItem {
  find: string
  replace: string
  file?: string
}

/**
 * Hook to validate patches in real-time with 300ms debounce.
 * For each patch, classifies whether its `find` text can be uniquely
 * located in the previous code state (accounting for cumulative patches).
 */
export function usePatchValidation(
  previousCode: string,
  patches: PatchItem[]
): PatchValidationState[] {
  const [validationStates, setValidationStates] = useState<PatchValidationState[]>([])

  // Memoize the patches key for the debounce trigger
  const patchesKey = useMemo(
    () => patches.map(p => p.find).join('|||'),
    [patches]
  )

  useEffect(() => {
    // Don't validate empty patches
    if (patches.length === 0) {
      setValidationStates([])
      return
    }

    const timer = setTimeout(() => {
      let currentCode = previousCode
      const states: PatchValidationState[] = []

      for (let i = 0; i < patches.length; i++) {
        const patch = patches[i]

        // Skip validation for empty find
        if (!patch.find.trim()) {
          states.push({
            patchIndex: i,
            result: { status: 'not_found', matchCount: 0 },
            isValid: false,
          })
          continue
        }

        const result = classifyPatchValidation(currentCode, patch.find)
        states.push({
          patchIndex: i,
          result,
          isValid: result.status === 'unique_match',
        })

        // Advance code state only if this patch is valid
        if (result.status === 'unique_match') {
          currentCode = currentCode.replace(patch.find, patch.replace)
        }
      }

      setValidationStates(states)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [previousCode, patchesKey, patches.length])

  return validationStates
}
