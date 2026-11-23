import { usePage } from 'fondu/client'

import { SITE } from '#/site.ts'

export const fullTitle = (title?: string) =>
  title ? `${title} · Fondu` : 'Fondu · Server routes. React pages. No API in between.'

export function Meta({
  title,
  description,
  markdown,
  noindex,
}: {
  title?: string
  description?: string
  markdown?: string
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
      <link rel="alternate" type="text/plain" title="LLM docs" href={`${SITE}/llms.txt`} />
      {markdown && (
        <link rel="alternate" type="text/markdown" title="Markdown source" href={markdown} />
      )}
      <meta property="og:type" content={markdown ? 'article' : 'website'} />
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
