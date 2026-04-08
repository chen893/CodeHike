import "./globals.css"

export const metadata = {
  title: "VibeDocs",
  description: "AI 驱动的 scrollytelling 源码教学教程生成与渲染。",
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
