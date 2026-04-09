import Link from "next/link"
import { listTutorials } from "../lib/tutorial-registry"
import * as publishedRepo from "../lib/repositories/published-tutorial-repository"
import { AppShell } from "@/components/app-shell"

export const metadata = {
  title: "VibeDocs",
  description: "AI 驱动的 scrollytelling 源码教学教程生成与渲染。",
}

export default async function Page() {
  const tutorials = listTutorials()

  let publishedTutorials = []
  try {
    publishedTutorials = await publishedRepo.listPublished()
  } catch (err) {
    console.error("加载已发布教程列表失败:", err)
  }

  return (
    <AppShell activePath="/">
      <div className="home-welcome">
        <h1>VibeDocs</h1>
        <p>AI 驱动的源码教学教程生成器。输入源码和教学意图，自动生成结构化的逐步构建式教程。</p>
        <Link href="/new">
          <button className="btn-accent">创建新教程</button>
        </Link>
      </div>

      {publishedTutorials.length > 0 && (
        <section>
          <p className="home-section-title">Published</p>
          <div className="home-card-list">
            {publishedTutorials.map((pub) => (
              <Link href={`/${pub.slug}`} key={pub.id} className="home-card">
                <p className="home-card-slug">{pub.slug}</p>
                <h3 className="home-card-title">
                  {pub.tutorialDraftSnapshot.meta.title}
                </h3>
                <p className="home-card-desc">
                  {pub.tutorialDraftSnapshot.meta.description}
                </p>
                <div className="home-card-links">
                  <span className="home-card-link">阅读教程</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="home-section-title">Sample Tutorials</p>
        <div className="home-card-list">
          {tutorials.map((tutorial) => (
            <div key={tutorial.slug} className="home-card">
              <p className="home-card-slug">{tutorial.slug}</p>
              <h3 className="home-card-title">{tutorial.title}</h3>
              <p className="home-card-desc">{tutorial.description}</p>
              <div className="home-card-links">
                <Link href={`/${tutorial.slug}`} className="home-card-link">
                  静态渲染
                </Link>
                <Link href={`/${tutorial.slug}/request`} className="home-card-link">
                  远程加载
                </Link>
                <Link href={`/api/tutorials/${tutorial.slug}`} className="home-card-link">
                  API Payload
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
