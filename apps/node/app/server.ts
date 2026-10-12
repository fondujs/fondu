import { createApp } from 'fondu'

// The Hono app from app/routes/ (with CSRF protection and security headers). The document is this app's own: the
// viewport is set here, and the fonts come from Google Fonts, which the Content Security Policy lets in.
export default createApp({
  document: ({ head, body }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Inter:wght@100..900&display=swap">
    ${head}
  </head>
  <body>${body}</body>
</html>`,
  secureHeaders: {
    contentSecurityPolicy: {
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    },
  },
})
