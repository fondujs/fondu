import { createInertiaApp } from '@inertiajs/react'

import DocsLayout from './layouts/docs'
import SiteLayout from './layouts/site'

import './styles/app.css'

createInertiaApp({
  pages: './pages',
  title: (title) => (title ? `${title} · Fondu` : 'Fondu: full-stack React on Hono, Vite and Inertia'),
  layout: (name) => (name.startsWith('docs/') ? [SiteLayout, DocsLayout] : SiteLayout),
  progress: { delay: 350, color: 'var(--brand)' },
})
