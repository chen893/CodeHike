import { CreateDraftForm } from "@/components/create-draft-form";
import { AppShell } from "@/components/app-shell";

export default function NewPage() {
  return (
    <AppShell activePath="/new">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <header className="space-y-2 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            创建新教程
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            贴入源码，描述你想教什么，我们会生成一份逐步构建式教程。
          </p>
        </header>
        <CreateDraftForm />
      </div>
    </AppShell>
  );
}
