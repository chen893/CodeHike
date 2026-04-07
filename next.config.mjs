import createMDX from "@next/mdx"
import { recmaCodeHike, remarkCodeHike } from "codehike/mdx"

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [[remarkCodeHike, { theme: "github-dark" }]],
    recmaPlugins: [recmaCodeHike],
  },
})

const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["js", "jsx", "md", "mdx"],
}

export default withMDX(nextConfig)
