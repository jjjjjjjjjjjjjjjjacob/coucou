"use client";

import { useParams } from "next/navigation";
import { UserDetailContent } from "@/components/users/user-detail-content";
import { useWorkspaceOperationPath } from "@/lib/use-workspace-scope";

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.userId as string;
  const guestsPath = useWorkspaceOperationPath("host", "guests");

  return (
    <UserDetailContent
      userReference={decodeURIComponent(userId)}
      variant="page"
      backHref={guestsPath}
      backLabel="Back to guests"
    />
  );
}
