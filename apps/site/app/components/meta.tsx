import { Head, usePage } from '@inertiajs/react'

export const SITE = 'https://fondu.dev'

/** a page's <title> (app.tsx); the home page's is the site's own */
export const fullTitle = (title?: string) =>
  title ? `${title} · Fondu` : 'Fondu: Server routes. React pages. No API in between.'

/**
 * A page's title and the tags search engines and link previews read: the description, the canonical URL (no query),
 * Open Graph. `noindex`: kept out of search results (the error page).
 */
export function Meta({
  title,
  description,
  noindex,
}: {
  title?: string
  description?: string
  noindex?: boolean
}) {
  const { url } = usePage()
  const canonical = SITE + url.split(/[?#]/)[0]
  return (
    <Head title={title ?? ''}>
      {description && <meta head-key="description" name="description" content={description} />}
      {noindex ? (
        <meta head-key="robots" name="robots" content="noindex" />
      ) : (
        <link head-key="canonical" rel="canonical" href={canonical} />
      )}
      <meta head-key="og:type" property="og:type" content="website" />
      <meta head-key="og:site_name" property="og:site_name" content="Fondu" />
      <meta head-key="og:title" property="og:title" content={fullTitle(title)} />
      {description && (
        <meta head-key="og:description" property="og:description" content={description} />
      )}
      <meta head-key="og:url" property="og:url" content={canonical} />
      <meta head-key="twitter:card" name="twitter:card" content="summary" />
    </Head>
  )
}
