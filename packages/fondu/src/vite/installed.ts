import { fileURLToPath } from 'node:url'

// Vite pre-bundles an installed package but serves a linked one as source, so edits reach the browser
export const isInstalled = (file: string) => /[\\/]node_modules[\\/]/.test(file)

export const fonduInstalled = () => isInstalled(fileURLToPath(import.meta.url))
