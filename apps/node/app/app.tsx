import { createInertiaApp } from '@inertiajs/react'

import Layout from './layout'

import './styles/app.css'

createInertiaApp({
  pages: './pages',
  title: (title) => `${title} · Fondu`,
  progress: { delay: 350, color: 'var(--accent)' },
  layout: () => Layout,
})
