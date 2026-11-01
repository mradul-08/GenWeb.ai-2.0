
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assertPublicClientEnv } from './src/firebaseConfig.js'

export default defineConfig(({ mode }) => {
  // Fail at dev start / build time (not in users' browsers) when the Firebase
  // configuration is missing or a secret-looking value has a VITE_ name.
  const firebase = assertPublicClientEnv(loadEnv(mode, process.cwd(), 'VITE_'))
  console.log(`[config] Firebase project: ${firebase.projectId} (mode: ${mode})`)

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          credentials: true,
        }
      }
    }
  }
})
