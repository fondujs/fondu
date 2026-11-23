import tailwindcss from '@tailwindcss/vite'
import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [fondu({ target: 'bun' }), tailwindcss()],
})
