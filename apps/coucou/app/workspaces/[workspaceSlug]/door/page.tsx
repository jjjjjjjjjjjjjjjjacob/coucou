import { redirect } from "next/navigation";

export default async function WorkspaceDoorPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  redirect(`/workspaces/${workspaceSlug}/dashboard/door/scan`);
}
