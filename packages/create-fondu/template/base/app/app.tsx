import { createInertiaApp } from '@inertiajs/react'

import Layout from './layout'

import './styles/app.css'

// The Inertia app, in the browser and for the server render: 'index' is app/pages/index.tsx, 'users/show' app/pages/users/show.tsx.
createInertiaApp({
  pages: './pages',
  title: (title) => (title ? `${title} · Fondu` : 'Fondu'),
  layout: () => Layout,
  progress: { delay: 350, color: 'var(--accent)' },
})
