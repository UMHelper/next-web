import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'What2REG @UM 澳大選咩課',
    short_name: 'What2REG @UM',
    description: 'Course review platform for University of Macau',
    start_url: '/',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#2563EB',
    icons: [
      {
        src: '/icon/72.jpg',
        sizes: '72x72',
        type: 'image/jpg',
      },
      {
        src: '/icon/96.jpg',
        sizes: '96x96',
        type: 'image/jpg',
      },
      {
        src: '/icon/128.jpg',
        sizes: '128x128',
        type: 'image/jpg',
      },
      {
        src: '/icon/144.jpg',
        sizes: '144x144',
        type: 'image/jpg',
      },
      {
        src: '/icon/152.jpg',
        sizes: '152x152',
        type: 'image/jpg',
      },
      {
        src: '/icon/192.jpg',
        sizes: '192x192',
        type: 'image/jpg',
      },
      {
        src: '/icon/384.jpg',
        sizes: '384x384',
        type: 'image/jpg',
      },
      {
        src: '/icon/512.jpg',
        sizes: '512x512',
        type: 'image/jpg',
      },
    ],
  }
}