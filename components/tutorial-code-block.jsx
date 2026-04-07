import { highlight, Pre } from "codehike/code"
import githubDark from "@code-hike/lighter/theme/github-dark.mjs"

export async function TutorialCodeBlock({ code, lang = "js", fileName }) {
  const highlighted = await highlight(
    {
      lang,
      value: code,
      meta: "",
    },
    githubDark,
  )

  return (
    <div className="tutorial-static-code">
      <div className="tutorial-static-code-meta">
        <span>{fileName}</span>
      </div>
      <Pre code={highlighted} />
    </div>
  )
}
