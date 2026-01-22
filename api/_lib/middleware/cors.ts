import type { RateLimitHeaders } from './rate-limit';

/**
 * Options for building headers
 */
export interface HeadersOptions {
  rateLimitHeaders?: RateLimitHeaders;
}

/**
 * Build CORS and security headers for API responses
 *
 * @param origin - The origin from the request
 * @param options - Optional configuration including rate limit headers
 * @returns Headers object with CORS, security, and optionally rate limit headers
 */
export function buildCorsHeaders(origin: string | null, options?: HeadersOptions): Headers {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] ?? '';
  const headers = new Headers();

  // CORS headers
  if (allowOrigin) {
    headers.set('Access-Control-Allow-Origin', allowOrigin);
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');

  // Expose rate limit headers to the client
  headers.set(
    'Access-Control-Expose-Headers',
    'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After'
  );

  // Security headers (CSP + additional)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Required for Vite HMR in dev
    "style-src 'self' 'unsafe-inline'", // Required for inline styles
    "img-src 'self' data: https://pawelserkowski.pl",
    "font-src 'self'",
    "connect-src 'self' https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://api.mistral.ai https://api.groq.com https://www.googleapis.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  headers.set('Content-Security-Policy', cspDirectives);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Add rate limit headers if provided (RFC 6585)
  if (options?.rateLimitHeaders) {
    const rlHeaders = options.rateLimitHeaders;
    headers.set('X-RateLimit-Limit', rlHeaders['X-RateLimit-Limit']);
    headers.set('X-RateLimit-Remaining', rlHeaders['X-RateLimit-Remaining']);
    headers.set('X-RateLimit-Reset', rlHeaders['X-RateLimit-Reset']);

    // Only set Retry-After on 429 responses
    if (rlHeaders['Retry-After']) {
      headers.set('Retry-After', rlHeaders['Retry-After']);
    }
  }

  return headers;
}

/**
 * Build headers for a 429 Too Many Requests response
 *
 * @param origin - The origin from the request
 * @param rateLimitHeaders - Rate limit headers to include
 * @returns Headers object configured for 429 response
 */
export function build429Headers(
  origin: string | null,
  rateLimitHeaders: RateLimitHeaders
): Headers {
  return buildCorsHeaders(origin, { rateLimitHeaders });
}
