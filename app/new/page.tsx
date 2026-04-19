import { redirect } from "next/navigation";
import { CreateDraftForm } from "@/components/create-draft-form";
import { TopNav } from "@/components/top-nav";
import { getCurrentUser } from "@/auth";

export default async function NewPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/new")}`);
  }

  return (
    <>
      <TopNav user={user} />
      <div className="container-app flex min-h-screen flex-col pt-14">
        <CreateDraftForm />
      </div>
    </>
  );
}
