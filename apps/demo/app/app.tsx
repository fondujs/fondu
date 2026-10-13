import { createInertiaApp } from '@inertiajs/react'

import AdminLayout from './layouts/admin'
import AppLayout from './layouts/app'

import './styles/app.css'

// The Inertia app, in the browser and (wrapped by @inertiajs/vite) for the server render. Pages are the files in
// app/pages/ ('contacts/show' is pages/contacts/show.tsx); the layout is chosen by the page's name.
createInertiaApp({
  pages: './pages',
  title: (title) => (title ? `${title} · Fondu` : 'Fondu'),
  layout: (name) => (name.startsWith('admin/') ? AdminLayout : AppLayout),
  progress: { delay: 350, color: 'var(--brand)' },
})
