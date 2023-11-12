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
        src: '/favicon.png',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}