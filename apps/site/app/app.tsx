import { createInertiaApp } from '@inertiajs/react'

import { fullTitle } from './components/meta'

import './styles/app.css'

// The pages' layouts are their directories' _layout.tsx: pages/_layout.tsx (the site), pages/docs/_layout.tsx (docs)
createInertiaApp({
  pages: './pages',
  title: fullTitle,
  progress: { delay: 350, color: 'var(--brand)' },
})
