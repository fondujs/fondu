import { createInertiaApp } from '@inertiajs/react'

import { fullTitle } from './components/meta'
import DocsLayout from './layouts/docs'
import SiteLayout from './layouts/site'

import './styles/app.css'

createInertiaApp({
  pages: './pages',
  title: fullTitle,
  layout: (name) => (name.startsWith('docs/') ? [SiteLayout, DocsLayout] : SiteLayout),
  progress: { delay: 350, color: 'var(--brand)' },
})
