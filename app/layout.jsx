import "./globals.css"

export const metadata = {
  title: "Build Your Own Redux",
  description: "A small Code Hike scrollycoding prototype for Redux.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
