import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";

// SECURITY: fail fast if no secret is configured — never sign tokens with a
// hardcoded fallback that an attacker could forge.
function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "NEXTAUTH_SECRET is not set (or too short). Add it to .env before starting the server."
    );
  }
  return new TextEncoder().encode(secret);
}

const SECRET: Uint8Array = getSecret();

export interface TokenUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Verify a Bearer token from an Authorization header.
 *  Returns the user payload or null. */
export async function verifyRequest(req: Request): Promise<TokenUser | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), SECRET);
    return payload as unknown as TokenUser;
  } catch {
    return null;
  }
}

/** Sign a JWT for a given user (expires in 24 h). */
export async function signToken(user: TokenUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET);
}

/** Validate email + password and return user data (or null). */
export async function authenticateCredentials(
  email: string,
  password: string
): Promise<TokenUser | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return null;
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
