import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const webPort = Number(process.env.WEB_PORT ?? 5173)

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    // Exact match only: subpath exports such as @office/shared/catalogue resolve through the package.
    alias: [
      { find: /^@office\/shared$/, replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
    ],
  },
  // WEB_PORT so several agents can run the app at once (HANDOFF.md section 5).
  // strictPort: fail fast instead of silently taking another port.
  server: { port: webPort, strictPort: true },
  preview: { port: webPort, strictPort: true },
})
