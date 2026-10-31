import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    // Exact match only: subpath exports such as @office/shared/catalogue resolve through the package.
    alias: [
      { find: /^@office\/shared$/, replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
    ],
  },
})

