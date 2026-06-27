import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

const resizeOptions = { background: '#252730', fit: 'contain' as const }

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    transparent: {
      ...minimal2023Preset.transparent,
      padding: 0,
      resizeOptions,
    },
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0,
      resizeOptions,
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0,
      resizeOptions,
    },
  },
  images: ['public/app-icon.svg'],
})
