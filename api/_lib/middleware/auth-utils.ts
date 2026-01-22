import { SignJWT, jwtVerify } from 'jose';

const ACCESS_TOKEN_TTL = 60 * 15; // 15 minutes
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return new TextEncoder().encode(secret);
}

function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, item) => {
    const [key, ...rest] = item.trim().split('=');
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

export async function signTokens(userId: string) {
  const secret = getSecret();
  const accessToken = await new SignJWT({ sub: userId, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .sign(secret);
  const refreshToken = await new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${REFRESH_TOKEN_TTL}s`)
    .sign(secret);

  return { accessToken, refreshToken };
}

export function setAuthCookies(headers: Headers, tokens: { accessToken: string; refreshToken: string }) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const common = `Path=/; HttpOnly; SameSite=Strict${secure}`;
  headers.append('Set-Cookie', `access_token=${tokens.accessToken}; Max-Age=${ACCESS_TOKEN_TTL}; ${common}`);
  headers.append('Set-Cookie', `refresh_token=${tokens.refreshToken}; Max-Age=${REFRESH_TOKEN_TTL}; ${common}`);
}

export function clearAuthCookies(headers: Headers) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const common = `Path=/; HttpOnly; SameSite=Strict${secure}`;
  headers.append('Set-Cookie', `access_token=; Max-Age=0; ${common}`);
  headers.append('Set-Cookie', `refresh_token=; Max-Age=0; ${common}`);
}

export async function verifyAccessToken(req: Request): Promise<string | null> {
  try {
    const cookies = parseCookies(req);
    const token = cookies.access_token;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(req: Request): Promise<string | null> {
  try {
    const cookies = parseCookies(req);
    const token = cookies.refresh_token;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
