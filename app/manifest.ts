import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'What2REG @UM 澳大選咩課',
    short_name: 'What2REG @UM',
    description: 'Course review platform for University of Macau',
    start_url: '/',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#fff',
    icons: [
      // Rendered from the shared iOS cat mark by `npm run icons:build`
      // (scripts/build-brand-icons.mjs). The retired 72…512 JPEG rasters under
      // /icon are no longer referenced anywhere.
      {
        src: '/icon/192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Full-bleed tile with extra padding: Android crops this to its own
        // shape, so the glyph stays inside the 80%-diameter safe circle.
        src: '/icon/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}