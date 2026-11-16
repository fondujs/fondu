import { fileURLToPath } from 'node:url'

/**
 * Whether the file is inside a `node_modules` directory: fondu installed as a package (its real path: Node resolves
 * links), not linked from a workspace (`packages/fondu`). Vite pre-bundles an installed package; a linked one is
 * served as source, so an edit of it reaches the browser: pre-bundled, the browser would keep the old chunk.
 */
export const isInstalled = (file: string) => /[\\/]node_modules[\\/]/.test(file)

/** fondu itself (this file) is installed */
export const fonduInstalled = () => isInstalled(fileURLToPath(import.meta.url))
