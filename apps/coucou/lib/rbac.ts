import { auth } from "@clerk/nextjs/server";
import { AuthObject } from "@/lib/types";

export async function checkRole(roles: string | string[]) {
  const list = Array.isArray(roles) ? roles : [roles];
  const authObj = await auth() as AuthObject;
  if (!authObj?.userId) return false;
  const hasFn: undefined | ((arg: { role: string }) => boolean) = authObj.has;
  const orgRole: string | undefined = authObj.orgRole;
  if (typeof hasFn === "function") {
    return list.some((r) => hasFn({ role: `org:${r}` }));
  }
  if (orgRole) return list.includes(orgRole);
  return false;
}

