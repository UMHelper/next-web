const courseEquivalences = require('./lib/course-equivalences.generated.json')

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async redirects() {
        // Historical course codes permanently move to their new primary code.
        // Regenerate lib/course-equivalences.generated.json after data changes
        // (npm run equivalences:redirects) so these stay real 308s; the page
        // components also redirect dynamically as a fallback.
        return Object.entries(courseEquivalences).flatMap(([from, to]) => [
            { source: `/course/${from}`, destination: `/course/${to}`, permanent: true },
            { source: `/reviews/${from}/:prof*`, destination: `/reviews/${to}/:prof*`, permanent: true },
            { source: `/submit/${from}/:prof*`, destination: `/submit/${to}/:prof*`, permanent: true },
        ])
    },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'img.clerk.com' },
            { protocol: 'https', hostname: 'erdqyqa4vgrnyxnx.public.blob.vercel-storage.com' },
            { protocol: 'https', hostname: 'i.imgur.com' },
        ],
    },
}

module.exports = nextConfig
