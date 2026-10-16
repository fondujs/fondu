import { createApp } from 'fondu'

// The Hono app from app/routes/: CSRF protection, security headers (with a Content Security
// Policy), one URL per page and the error page (app/pages/error.tsx) are built in.
// Options: createApp({ document, secureHeaders, … }).
export default createApp()
