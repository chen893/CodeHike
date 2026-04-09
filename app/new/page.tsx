import { CreateDraftForm } from '@/components/create-draft-form';
import { AppShell } from '@/components/app-shell';

export default function NewPage() {
  return (
    <AppShell activePath="/new">
      <header className="new-header">
        <h1>创建新教程</h1>
        <p>输入源码和教学意图，AI 将生成一份结构化的逐步构建式教程。</p>
      </header>
      <CreateDraftForm />
    </AppShell>
  );
}
