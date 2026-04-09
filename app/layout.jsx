import "./globals.css"

export const metadata = {
  title: "VibeDocs",
  description: "把源码变成逐步构建的交互式教程。",
  icons: {
    icon: "/favicon.svg",
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">{children}</body>
    </html>
  )
}
