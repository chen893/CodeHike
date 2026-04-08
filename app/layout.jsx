import "./globals.css"

export const metadata = {
  title: "Tutorial Renderer",
  description: "A generic CodeHike-based app for rendering scrolly tutorials.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
