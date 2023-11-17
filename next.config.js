/** @type {import('next').NextConfig} */
const { withContentlayer } = require("next-contentlayer")
const nextConfig = {
    images: {
        domains: ['img.clerk.com'],
    },
}

module.exports = withContentlayer(nextConfig)
