import NextAuth from 'next-auth'

// Lightweight auth for middleware — no DB adapter (Edge Runtime compatible)
// Just verifies the JWT session cookie; user/account creation happens in the full auth.ts
const { auth } = NextAuth({
  providers: [],
})

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes: homepage, published tutorials, auth callbacks, model probe
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/tutorials/') ||
    pathname.startsWith('/api/models/')

  // Protected routes that require authentication
  const isProtectedRoute =
    pathname.startsWith('/drafts') ||
    pathname.startsWith('/new') ||
    pathname.startsWith('/api/drafts')

  if (isProtectedRoute && !req.auth) {
    // API routes should return 401 JSON
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    // Page routes should redirect to login
    return Response.redirect(new URL('/api/auth/signin', req.url))
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
