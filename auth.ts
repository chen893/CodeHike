import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, accounts, verificationTokens } from '@/lib/db/schema'
import { withBasePath } from '@/lib/base-path'

const linuxdoAuthorizationEndpoint =
  process.env.LINUXDO_AUTHORIZATION_ENDPOINT ||
  'https://connect.linux.do/oauth2/authorize'
const linuxdoTokenEndpoint =
  process.env.LINUXDO_TOKEN_ENDPOINT ||
  'https://connect.linuxdo.org/oauth2/token'
const linuxdoUserinfoEndpoint =
  process.env.LINUXDO_USERINFO_ENDPOINT ||
  'https://connect.linuxdo.org/api/user'

async function syncOAuthAccountTokens(params: {
  provider?: string | null
  providerAccountId?: string | null
  access_token?: string | null
  refresh_token?: string | null
  expires_at?: number | null
  token_type?: string | null
  scope?: string | null
  id_token?: string | null
  session_state?: string | null
}) {
  try {
    const { provider, providerAccountId } = params

    if (!provider || !providerAccountId) {
      return
    }

    const tokenFields = {
      access_token: params.access_token ?? null,
      refresh_token: params.refresh_token ?? null,
      expires_at: params.expires_at ?? null,
      token_type: params.token_type ?? null,
      scope: params.scope ?? null,
      id_token: params.id_token ?? null,
      session_state: params.session_state ?? null,
    }

    const [updatedAccount] = await db
      .update(accounts)
      .set(tokenFields)
      .where(
        and(
          eq(accounts.provider, provider),
          eq(accounts.providerAccountId, providerAccountId)
        )
      )
      .returning({
        provider: accounts.provider,
        providerAccountId: accounts.providerAccountId,
      })

    console.log('[auth][oauth] synced account tokens', {
      provider,
      providerAccountId,
      hasAccessToken: Boolean(tokenFields.access_token),
      tokenLength: tokenFields.access_token?.length ?? 0,
      updated: Boolean(updatedAccount),
    })
  } catch (error) {
    console.error('[auth][oauth] Failed to sync account tokens', {
      provider: params.provider,
      providerAccountId: params.providerAccountId,
      error: error instanceof Error ? error.message : String(error),
    })
    // Non-critical: don't throw, auth flow should continue
  }
}

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
      issuer: 'https://connect.linux.do/',
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
    signIn: withBasePath('/auth/signin'),
  },
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id
      }

      if (trigger === 'signIn' && account?.type === 'oauth') {
        await syncOAuthAccountTokens({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: typeof account.session_state === 'string' ? account.session_state : null,
        })
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
  events: {
    async signIn({ user, account }) {
      if (account?.provider === 'github') {
        console.log('[auth][github] signIn', {
          userId: user?.id ?? null,
          providerAccountId: account.providerAccountId ?? null,
          hasAccessToken: Boolean(account.access_token),
          tokenLength: account.access_token?.length ?? 0,
          expiresAt: account.expires_at ?? null,
          scope: account.scope ?? null,
          tokenType: account.token_type ?? null,
        });
      }
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
