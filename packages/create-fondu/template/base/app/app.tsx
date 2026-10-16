import { createInertiaApp } from '@inertiajs/react'

import './styles/app.css'

// The Inertia app, in the browser and for the server render: 'index' is app/pages/index.tsx,
// 'users/show' app/pages/users/show.tsx. Layouts: app/pages/_layout.tsx around every page, a
// directory's _layout.tsx around its own.
createInertiaApp({
  pages: './pages',
  title: (title) => (title ? `${title} · Fondu` : 'Fondu'),
  progress: { delay: 350, color: 'var(--accent)' },
})
