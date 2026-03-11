// Placeholder rate limiter for CricVeda APIs.

export function checkRateLimit(_apiKey: string): { allowed: boolean; retryAfterSeconds?: number } {
  return { allowed: true };
}

