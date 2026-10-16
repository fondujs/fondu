import { createInertiaApp } from '@inertiajs/react'

import AppLayout from './layouts/app'

import './styles/app.css'

// The Inertia app, in the browser and (wrapped by @inertiajs/vite) for the server render. Pages are the files in
// app/pages/ ('contacts/show' is pages/contacts/show.tsx). Their layout: AppLayout, but for the pages of a directory
// with its own _layout.tsx (pages/admin/_layout.tsx).
createInertiaApp({
  pages: './pages',
  title: (title) => (title ? `${title} · Fondu demo` : 'Fondu demo'),
  layout: () => AppLayout,
  progress: { delay: 350, color: 'var(--brand)' },
})
