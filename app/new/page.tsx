import { redirect } from "next/navigation";
import { CreateDraftForm } from "@/components/create-draft-form";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/auth";

export default async function NewPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/new")}`);
  }

  return (
    <AppShell activePath="/new" user={user}>
      <div className="container-app flex min-h-screen flex-col py-10">
        <CreateDraftForm />
      </div>
    </AppShell>
  );
}
