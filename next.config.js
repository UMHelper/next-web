/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'img.clerk.com' },
            { protocol: 'https', hostname: 'erdqyqa4vgrnyxnx.public.blob.vercel-storage.com' },
            { protocol: 'https', hostname: 'i.imgur.com' },
        ],
    },
}

module.exports = nextConfig
