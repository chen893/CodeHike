import { redirect } from "next/navigation";
import { CreateDraftForm } from "@/components/create-draft-form";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/auth";

export default async function NewPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/api/auth/signin");
  }

  return (
    <AppShell activePath="/new" user={user}>
      <div className="mx-auto flex min-h-screen w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
        <CreateDraftForm />
      </div>
    </AppShell>
  );
}
