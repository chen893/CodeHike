export function buildRelativeCallbackUrl(url: Pick<URL, 'pathname' | 'search'>) {
  const pathname = url.pathname || '/';
  const search = url.search || '';

  return `${pathname}${search}` || '/';
}
