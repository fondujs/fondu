import { NONCE } from 'hono/secure-headers'
import { createApp } from 'fondu'

// The app from app/routes/. Everything else is built in: CSRF, security headers (here with a CSP), trailing
// slashes, the error page (pages/error.tsx).
export default createApp({
  secureHeaders: { contentSecurityPolicy: { defaultSrc: ["'self'"], scriptSrc: ["'self'", NONCE], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'] } },
})
