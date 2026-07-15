import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { db } from "../db/client";
import { magicLinkRequests, sessions, users } from "../db/schema";
import { env } from "../env";
import { ApiError } from "../errors";
import { auth } from "./config";
import {
  captureAuthLinks,
  hashAuthToken,
  normalizeEmail,
} from "./email";

function authError(error: unknown, fallback: string): ApiError {
  if (error instanceof ApiError) return error;

  if (error && typeof error === "object" && "statusCode" in error) {
    const details = error as {
      statusCode: number;
      body?: { code?: string; message?: string };
    };
    const code = details.body?.code ?? "AUTH_REQUEST_FAILED";
    const message =
      code === "INVALID_EMAIL_OR_PASSWORD"
        ? "Email or password is incorrect."
        : details.body?.message || fallback;
    return new ApiError(details.statusCode, code, message);
  }

  return new ApiError(500, "AUTH_REQUEST_FAILED", fallback);
}

function clearSessionCookie(): string {
  const secure = env.isProduction ? "; Secure" : "";
  return `vocalonix_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function safeReturnTo(value: string | undefined): string | undefined {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return undefined;
  }
  const resolved = new URL(value, env.appOrigin);
  return resolved.origin === new URL(env.appOrigin).origin
    ? `${resolved.pathname}${resolved.search}${resolved.hash}`
    : undefined;
}

function sessionPayload(result: Awaited<ReturnType<typeof auth.api.getSession>>) {
  if (!result) return null;

  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      emailVerified: result.user.emailVerified,
    },
    session: {
      id: result.session.id,
      createdAt: result.session.createdAt,
      updatedAt: result.session.updatedAt,
      expiresAt: result.session.expiresAt,
    },
  };
}

async function requireSession(headers: Headers) {
  const result = await auth.api.getSession({ headers });
  if (!result) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  return result;
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .post(
    "/signup",
    async ({ body, request, set }) => {
      try {
        const captured = await captureAuthLinks(
          () =>
            auth.api.signUpEmail({
              headers: request.headers,
              returnHeaders: true,
              body: {
                name: body.name.trim(),
                email: normalizeEmail(body.email),
                password: body.password,
              },
            }),
          safeReturnTo(body.returnTo),
        );
        const cookie = captured.result.headers.get("set-cookie");
        if (cookie) set.headers["set-cookie"] = cookie;

        if (!env.requireEmailVerification) {
          await db
            .update(users)
            .set({ emailVerified: true, updatedAt: new Date() })
            .where(eq(users.id, captured.result.response.user.id));
        }

        return {
          user: {
            id: captured.result.response.user.id,
            name: captured.result.response.user.name,
            email: captured.result.response.user.email,
            emailVerified:
              captured.result.response.user.emailVerified ||
              !env.requireEmailVerification,
          },
          requiresVerification: env.requireEmailVerification,
          verificationPreviewUrl: env.isProduction
            ? null
            : captured.links.verificationLink ?? null,
        };
      } catch (error) {
        throw authError(error, "Unable to create the account.");
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8, maxLength: 128 }),
        returnTo: t.Optional(t.String({ maxLength: 2048 })),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, request, set }) => {
      try {
        const result = await auth.api.signInEmail({
          headers: request.headers,
          returnHeaders: true,
          body: {
            email: normalizeEmail(body.email),
            password: body.password,
            rememberMe: body.rememberMe,
          },
        });
        const cookie = result.headers.get("set-cookie");
        if (cookie) set.headers["set-cookie"] = cookie;

        return {
          user: {
            id: result.response.user.id,
            name: result.response.user.name,
            email: result.response.user.email,
            emailVerified: result.response.user.emailVerified,
          },
        };
      } catch (error) {
        throw authError(error, "Unable to sign in.");
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 1, maxLength: 128 }),
        rememberMe: t.Optional(t.Boolean()),
      }),
    },
  )
  .get("/session", async ({ request, set }) => {
    try {
      const result = await auth.api.getSession({
        headers: request.headers,
        returnHeaders: true,
      });
      const cookie = result.headers.get("set-cookie");
      if (cookie) set.headers["set-cookie"] = cookie;
      return { session: sessionPayload(result.response) };
    } catch (error) {
      throw authError(error, "Unable to restore the session.");
    }
  })
  .post("/refresh", async ({ request, set }) => {
    try {
      const result = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
        returnHeaders: true,
      });
      const cookie = result.headers.get("set-cookie");
      if (cookie) set.headers["set-cookie"] = cookie;
      return { session: sessionPayload(result.response) };
    } catch (error) {
      throw authError(error, "Unable to refresh the session.");
    }
  })
  .post("/logout", async ({ request, set }) => {
    try {
      const result = await auth.api.signOut({
        headers: request.headers,
        returnHeaders: true,
      });
      const cookie = result.headers.get("set-cookie");
      set.headers["set-cookie"] = cookie ?? clearSessionCookie();
      return { success: result.response.success };
    } catch (error) {
      throw authError(error, "Unable to sign out.");
    }
  })
  .post("/logout-all", async ({ request, set }) => {
    try {
      const current = await requireSession(request.headers);
      await db.delete(sessions).where(eq(sessions.userId, current.user.id));
      set.headers["set-cookie"] = clearSessionCookie();
      return { success: true };
    } catch (error) {
      throw authError(error, "Unable to sign out everywhere.");
    }
  })
  .get("/sessions", async ({ request }) => {
    const current = await requireSession(request.headers);
    const activeSessions = await db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        expiresAt: sessions.expiresAt,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, current.user.id),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.updatedAt));

    return {
      sessions: activeSessions.map((session) => ({
        ...session,
        current: session.id === current.session.id,
      })),
    };
  })
  .post(
    "/magic/request",
    async ({ body, request }) => {
      try {
        const captured = await captureAuthLinks(
          () =>
            auth.api.signInMagicLink({
              headers: request.headers,
              body: {
                email: normalizeEmail(body.email),
              },
            }),
          safeReturnTo(body.returnTo),
        );

        return {
          success: captured.result.status,
          previewUrl: env.isProduction
            ? null
            : captured.links.magicLink ?? null,
        };
      } catch (error) {
        throw authError(error, "Unable to create a sign-in link.");
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        returnTo: t.Optional(t.String({ maxLength: 2048 })),
      }),
    },
  )
  .post(
    "/magic/consume",
    async ({ body, request, set }) => {
      const tokenHash = hashAuthToken(body.token);
      const [link] = await db
        .select()
        .from(magicLinkRequests)
        .where(eq(magicLinkRequests.tokenHash, tokenHash))
        .limit(1);

      if (!link) {
        throw new ApiError(400, "INVALID_TOKEN", "This sign-in link is invalid.");
      }
      if (link.consumedAt) {
        throw new ApiError(
          409,
          "TOKEN_ALREADY_USED",
          "This sign-in link has already been used.",
        );
      }
      if (link.expiresAt <= new Date()) {
        throw new ApiError(
          410,
          "TOKEN_EXPIRED",
          "This sign-in link has expired.",
        );
      }

      const [claimed] = await db
        .update(magicLinkRequests)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(magicLinkRequests.id, link.id),
            isNull(magicLinkRequests.consumedAt),
            gt(magicLinkRequests.expiresAt, new Date()),
          ),
        )
        .returning({ id: magicLinkRequests.id });

      if (!claimed) {
        const [current] = await db
          .select()
          .from(magicLinkRequests)
          .where(eq(magicLinkRequests.id, link.id))
          .limit(1);
        if (current?.consumedAt) {
          throw new ApiError(
            409,
            "TOKEN_ALREADY_USED",
            "This sign-in link has already been used.",
          );
        }
        throw new ApiError(
          410,
          "TOKEN_EXPIRED",
          "This sign-in link has expired.",
        );
      }

      try {
        const result = await auth.api.magicLinkVerify({
          headers: request.headers,
          returnHeaders: true,
          query: { token: body.token },
        });
        const cookie = result.headers.get("set-cookie");
        if (cookie) set.headers["set-cookie"] = cookie;

        return {
          success: true,
          user: {
            id: result.response.user.id,
            name: result.response.user.name,
            email: result.response.user.email,
            emailVerified: result.response.user.emailVerified,
          },
        };
      } catch (error) {
        throw authError(error, "This sign-in link could not be used.");
      }
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1 }),
      }),
    },
  )
  .post(
    "/email/verify",
    async ({ body, request, set }) => {
      try {
        const result = await auth.api.verifyEmail({
          headers: request.headers,
          returnHeaders: true,
          query: { token: body.token },
        });
        const cookie = result.headers.get("set-cookie");
        if (cookie) set.headers["set-cookie"] = cookie;
        return { success: result.response?.status ?? false };
      } catch (error) {
        throw authError(error, "This verification link could not be used.");
      }
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1 }),
      }),
    },
  );
