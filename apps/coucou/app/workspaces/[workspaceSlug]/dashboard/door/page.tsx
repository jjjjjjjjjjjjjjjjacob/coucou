import { redirect } from "next/navigation";

export default async function WorkspaceDashboardDoorPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  redirect(`/workspaces/${workspaceSlug}/dashboard/door/scan`);
}
