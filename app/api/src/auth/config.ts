import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";

import { db } from "../db/client";
import { accounts, sessions, users, verifications } from "../db/schema";
import { env } from "../env";
import { deliverMagicLink, deliverVerificationLink } from "./email";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  secret: env.authSecret,
  baseURL: env.apiPublicUrl,
  basePath: "/api/auth/internal",
  trustedOrigins: env.appOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: env.requireEmailVerification,
    autoSignIn: !env.requireEmailVerification,
  },
  emailVerification: {
    sendOnSignUp: env.requireEmailVerification,
    sendOnSignIn: env.requireEmailVerification,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, token }) => {
      await deliverVerificationLink({ email: user.email, token });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 10,
  },
  advanced: {
    useSecureCookies: env.isProduction,
    cookies: {
      session_token: {
        name: "vocalonix_session",
        attributes: {
          httpOnly: true,
          sameSite: "lax",
          secure: env.isProduction,
          path: "/",
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: env.magicLinkTtlSeconds,
      disableSignUp: true,
      storeToken: "hashed",
      rateLimit: {
        window: 60,
        max: 3,
      },
      sendMagicLink: async ({ email, token }) => {
        await deliverMagicLink({ email, token });
      },
    }),
  ],
});
