import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { users, accounts, verificationTokens } from '@/lib/db/schema'

const linuxdoAuthorizationEndpoint =
  process.env.LINUXDO_AUTHORIZATION_ENDPOINT ||
  'https://connect.linuxdo.org/oauth2/authorize'
const linuxdoTokenEndpoint =
  process.env.LINUXDO_TOKEN_ENDPOINT ||
  'https://connect.linuxdo.org/oauth2/token'
const linuxdoUserinfoEndpoint =
  process.env.LINUXDO_USERINFO_ENDPOINT ||
  'https://connect.linuxdo.org/api/user'

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: '/api/auth',
  redirectProxyUrl: process.env.AUTH_REDIRECT_PROXY_URL,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
    {
      id: 'linuxdo',
      name: 'Linux.do',
      type: 'oauth',
      authorization: linuxdoAuthorizationEndpoint,
      token: linuxdoTokenEndpoint,
      userinfo: linuxdoUserinfoEndpoint,
      clientId: process.env.LINUXDO_ID,
      clientSecret: process.env.LINUXDO_SECRET,
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.username || profile.name,
          email: profile.email ?? null,
          image: profile.avatar_url,
        }
      },
    },
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}
