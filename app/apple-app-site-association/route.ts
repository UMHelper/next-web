import { appleAppSiteAssociation } from '@/lib/apple-app-site-association'

export const dynamic = 'force-static'

export function GET() {
  return Response.json(appleAppSiteAssociation, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
