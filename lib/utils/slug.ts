const RESERVED_SLUGS = new Set([
  'new',
  'drafts',
  'api',
  '_next',
  'sample',
  'request',
  'preview',
]);

export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')  // 去掉首尾连字符，避免生成 "-xxx" 这样的 slug
    .slice(0, 80);

  // 如果标题清理后为空（如全特殊字符），使用 fallback 前缀
  const safeBase = base || 'untitled';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${safeBase}-${suffix}`;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
