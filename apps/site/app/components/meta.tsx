import { usePage } from 'fondu/client'

export const SITE = 'https://fondu.dev'

/** a page's <title>; the home page's is the site's own */
export const fullTitle = (title?: string) =>
  title ? `${title} · Fondu` : 'Fondu · Server routes. React pages. No API in between.'

/**
 * A page's title and the tags search engines and link previews read: the description, the canonical URL (no query),
 * Open Graph with the site's image (public/og.png, from .github/assets/og.svg). `noindex`: kept out of search results
 * (the error page).
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
    // React puts them in <head>
    <>
      <title>{fullTitle(title)}</title>
      {description && <meta name="description" content={description} />}
      {noindex ? (
        <meta name="robots" content="noindex" />
      ) : (
        <link rel="canonical" href={canonical} />
      )}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Fondu" />
      <meta property="og:title" content={fullTitle(title)} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={`${SITE}/og.png`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={fullTitle()} />
      <meta name="twitter:card" content="summary_large_image" />
    </>
  )
}
