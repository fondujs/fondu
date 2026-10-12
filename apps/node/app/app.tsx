import { createInertiaApp } from '@inertiajs/react'
import Layout from './layout'
import './styles.css'

createInertiaApp({
  pages: './pages',
  title: (title) => `${title} · Fondu`,
  layout: () => Layout,
})
