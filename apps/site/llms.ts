import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

import { docs, docUrl } from './app/docs.ts'

const SITE = 'https://fondu.dev'
const SUMMARY =
  'A small meta-framework for full-stack React apps, built on Hono, Vite and Inertia. It runs on Node, Bun and Cloudflare Workers.'

/** a page's Markdown: the MDX source less its import / export lines (outside code blocks) */
function markdown(slug: string): string {
  let fenced = false
  return readFileSync(new URL(`./app/pages/docs/${slug || 'index'}.mdx`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => {
      if (/^(```|~~~)/.test(line)) fenced = !fenced
      return fenced || !/^(import|export) /.test(line)
    })
    .join('\n')
    .trim()
}

/** llms.txt (https://llmstxt.org) and llms-full.txt, every page in one file: written with the client build */
export function llms(): Plugin {
  return {
    name: 'site:llms',
    apply: 'build',
    generateBundle() {
      if (this.environment.name !== 'client') return
      const index = [
        '# Fondu',
        `> ${SUMMARY}`,
        '## Docs',
        docs.map((d) => `- [${d.title}](${SITE}${docUrl(d)}): ${d.description}`).join('\n'),
        '## Optional',
        `- [All the docs](${SITE}/llms-full.txt): every page above in one file`,
      ]
      const full = [
        `# Fondu\n\n> ${SUMMARY}`,
        ...docs.map((d) => `# ${d.title}\n\nSource: ${SITE}${docUrl(d)}\n\n> ${d.description}\n\n${markdown(d.slug)}`),
      ]
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: index.join('\n\n') + '\n' })
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: full.join('\n\n') + '\n' })
    },
  }
}
