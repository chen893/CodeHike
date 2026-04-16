import {
  MAX_FILES_TOTAL,
  MAX_TOTAL_LINES,
  MAX_FILE_BYTES,
} from '@/lib/constants/github-import';

/**
 * Validate source items against import limits.
 * Throws on violation — intended for server-side use.
 */
export function assertSourceImportLimits(
  sourceItems: { label: string; content: string }[],
): void {
  if (sourceItems.length > MAX_FILES_TOTAL) {
    throw new Error(
      `最多导入 ${MAX_FILES_TOTAL} 个文件，当前选择了 ${sourceItems.length} 个`,
    );
  }

  const oversized = sourceItems.find(
    (item) => new TextEncoder().encode(item.content).length > MAX_FILE_BYTES,
  );
  if (oversized) {
    throw new Error(
      `文件 ${oversized.label} 超过单文件大小上限 (${(MAX_FILE_BYTES / 1024).toFixed(0)}KB)`,
    );
  }

  const totalLines = sourceItems.reduce(
    (sum, item) => sum + item.content.split('\n').length,
    0,
  );
  if (totalLines > MAX_TOTAL_LINES) {
    throw new Error(
      `源码总行数 (${totalLines}) 超过上限 (${MAX_TOTAL_LINES})`,
    );
  }
}
