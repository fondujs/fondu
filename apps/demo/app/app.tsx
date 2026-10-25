import { startApp } from 'fondu/client'

import AppLayout from './components/app-layout.tsx'

import './styles/app.css'

// The app, in the browser and for the server render. Pages are the files in app/pages/ ('contacts/show' is
// pages/contacts/show.tsx). Their layout: AppLayout, but for the pages of a directory with its own _layout.tsx
// (pages/admin/_layout.tsx).
startApp({ layout: AppLayout })
