const path = require('path')

const courseEquivalences = require('./lib/course-equivalences.generated.json')

const COPILOTKIT_V2_DIST = path.join('@copilotkit', 'react-core', 'dist', 'v2')
const ASSISTANT_BUILD_STUBS = path.join(__dirname, 'lib', 'assistant', 'build-stubs')

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // `next dev` writes to .next-dev (set via NEXT_DIST_DIR in the dev scripts) so a
    // production `next build` (run by opennextjs-cloudflare into .next) cannot wipe the
    // dev manifests out from under a running dev server.
    distDir: process.env.NEXT_DIST_DIR || '.next',
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
    webpack(config, { webpack }) {
        // CopilotKit's provider entry imports precompiled Tailwind v4 CSS that the Tailwind 3 PostCSS
        // plugin rejects. The assistant renders its own AI Elements UI, so the import is stubbed.
        // Turbopack (next dev) skips this hook and compiles the original file without errors.
        config.plugins.push(
            new webpack.NormalModuleReplacementPlugin(/^\.\/index\.css$/, (resource) => {
                if (resource.context && resource.context.includes(COPILOTKIT_V2_DIST)) {
                    resource.request = path.join(ASSISTANT_BUILD_STUBS, 'copilotkit-styles.css')
                }
            }),
        )
        // streamdown (pulled in by CopilotKit's UI bundle) lazy-loads every Shiki grammar and Mermaid
        // diagram, and the webpack runtime that every page ships maps all of those chunks. The stubs
        // keep pages without the assistant at their baseline size.
        config.resolve.alias = {
            ...config.resolve.alias,
            shiki$: path.join(ASSISTANT_BUILD_STUBS, 'shiki.mjs'),
            'shiki/engine/javascript$': path.join(ASSISTANT_BUILD_STUBS, 'shiki-engine-javascript.mjs'),
            mermaid$: path.join(ASSISTANT_BUILD_STUBS, 'mermaid.mjs'),
        }
        return config
    },
}

module.exports = nextConfig
