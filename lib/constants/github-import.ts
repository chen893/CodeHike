/**
 * GitHub import constants for large-repo scaling.
 *
 * Shared across client components, server routes, and utility modules.
 * All limits are enforced server-side; some are also checked client-side
 * for faster feedback.
 */

/** 单次 API 请求最大文件数（服务端校验） */
export const MAX_FILES_PER_REQUEST = 30;

/** 单次导入最大文件总数（客户端展示 + 服务端最终校验） */
export const MAX_FILES_TOTAL = 200;

/** 单次导入最大总行数（服务端最终校验） */
export const MAX_TOTAL_LINES = 15_000;

/** 单次 GitHub file-content 请求最大总行数，防止单批 JSON 过大 */
export const MAX_LINES_PER_REQUEST = 5_000;

/** 单文件最大字节数，超过则不允许导入全文 */
export const MAX_FILE_BYTES = 100_000;

/** 大文件行数警告阈值（75%） */
export const WARN_LINES_RATIO = 0.75;

/** 文件获取批次大小 */
export const FETCH_BATCH_SIZE = 30;

/** GitHub API 批量获取并发数 */
export const GITHUB_API_BATCH_CONCURRENCY = 5;

/** GitHub API 速率限制缓冲（保留请求数） */
export const RATE_LIMIT_BUFFER = 50;

/** 批次间延迟（毫秒） */
export const BATCH_DELAY_MS = 500;

/** 失败重试次数 */
export const RETRY_ATTEMPTS = 3;
