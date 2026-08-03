import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readThemeTokens, requireHexThemeToken } from './scripts/theme-tokens.mjs'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const themeTokens = readThemeTokens()
const themeBackground = requireHexThemeToken(themeTokens, '--bg')
// Capacitor serves the bundled app from the webview root, so it must build with
// base '/', NOT the GitHub Pages subpath (otherwise every asset 404s -> blank app).
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true'
const base = isCapacitorBuild
  ? '/'
  : process.env.GITHUB_ACTIONS === 'true' && repositoryName
    ? `/${repositoryName}/`
    : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  build: {
    // Keep the account-sync SDK cacheable as its own initial chunk. This also leaves enough room in
    // the core app bundle for focused screens without regressing into Vite's large-chunk warning.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'fitness-hub-theme',
      transformIndexHtml: (html: string) => html.replaceAll('%THEME_BG%', themeBackground),
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['app-icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: base,
        name: 'Fitness Hub',
        short_name: 'Fitness Hub',
        description: 'Track workouts, weights, rest times, and results.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: themeBackground,
        theme_color: themeBackground,
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
      },
    }),
  ],
})
