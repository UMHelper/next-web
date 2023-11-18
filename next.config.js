/** @type {import('next').NextConfig} */
const { withContentlayer } = require("next-contentlayer")
const nextConfig = {
    images: {
        domains: ['img.clerk.com'],
    },
}

const pwaConfig = {
    dest: "public",
    register: true,
};
const withPWA = require('next-pwa')(pwaConfig)
module.exports = withPWA(withContentlayer(nextConfig))
