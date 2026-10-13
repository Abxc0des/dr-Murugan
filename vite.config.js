import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Unit-test configuration (Vitest). Tests run in a plain Node environment:
  // they exercise pure helpers with mocked Supabase modules and never render a
  // browser or touch the network.
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
