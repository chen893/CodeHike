import NextAuth from 'next-auth'

// Lightweight auth for middleware — no DB adapter (Edge Runtime compatible)
// Just verifies the JWT session cookie; user/account creation happens in the full auth.ts
const { auth } = NextAuth({
  providers: [],
})

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes: homepage, published tutorials, explore, tags, profiles, auth callbacks, model probe, search
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/auth/signin') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/tutorials/') ||
    pathname.startsWith('/api/models/') ||
    pathname.startsWith('/api/tags') ||
    pathname.startsWith('/api/search') ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/tags') ||
    pathname.startsWith('/u/')

  // Protected routes that require authentication
  const isProtectedRoute =
    pathname.startsWith('/drafts') ||
    pathname.startsWith('/new') ||
    pathname.startsWith('/api/drafts') ||
    pathname.startsWith('/api/user/') ||
    pathname.startsWith('/api/github/')

  if (isProtectedRoute && !req.auth) {
    // API routes should return 401 JSON
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    // Page routes should redirect to login
    return Response.redirect(new URL('/auth/signin', req.url))
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
