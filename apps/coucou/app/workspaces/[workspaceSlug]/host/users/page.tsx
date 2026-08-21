"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery, useConvexAction } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Crown, DoorOpen, Search, Shield, User, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { PageToolbar } from "@/components/page-toolbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageCard } from "@/components/ui/page-card";
import { Select, SelectOption } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type {
  OrganizationUserListItem,
  OrganizationUserSortDirection,
  OrganizationUserSortOption,
  OrganizationUsersResponse,
} from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, userId } = useAuth();
  const workspaceScope = useWorkspaceScope();
  const usersPath = useWorkspaceOperationPath("host", "users");

  const pageIndex = parseInt(searchParams.get("page") || "0");
  const pageSize = parseInt(searchParams.get("pageSize") || "10");

  const determineSortByFromParam = (value: string | null): OrganizationUserSortOption => {
    if (value === "name" || value === "role" || value === "createdAt") {
      return value;
    }
    return "createdAt";
  };

  const determineSortDirectionFromParam = (
    value: string | null,
    fallbackSortBy: OrganizationUserSortOption,
  ): OrganizationUserSortDirection => {
    if (value === "asc" || value === "desc") {
      return value;
    }
    return fallbackSortBy === "createdAt" ? "desc" : "asc";
  };

  const initialSortBy = determineSortByFromParam(searchParams.get("sortBy"));
  const initialSortDirection = determineSortDirectionFromParam(
    searchParams.get("sortDirection"),
    initialSortBy,
  );

  const [sortBy, setSortBy] = React.useState<OrganizationUserSortOption>(initialSortBy);
  const [sortDirection, setSortDirection] =
    React.useState<OrganizationUserSortDirection>(initialSortDirection);
  const tableSorting = React.useMemo<SortingState>(
    () => [
      {
        id: sortBy === "name" ? "user" : sortBy,
        desc: sortDirection === "desc",
      },
    ],
    [sortBy, sortDirection],
  );
  const updateSortQueryParams = React.useCallback(
    (nextSortBy: OrganizationUserSortOption, nextSortDirection: OrganizationUserSortDirection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", "0");
      if (nextSortBy === "createdAt" && nextSortDirection === "desc") {
        params.delete("sortBy");
        params.delete("sortDirection");
      } else {
        params.set("sortBy", nextSortBy);
        params.set("sortDirection", nextSortDirection);
      }
      router.replace(`${usersPath}?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, usersPath],
  );

  const applySortingSelection = React.useCallback(
    (nextSortBy: OrganizationUserSortOption, nextSortDirection: OrganizationUserSortDirection) => {
      setSortBy(nextSortBy);
      setSortDirection(nextSortDirection);
      updateSortQueryParams(nextSortBy, nextSortDirection);
    },
    [updateSortQueryParams],
  );

  const resolveSortLabel = React.useCallback((sortOption: OrganizationUserSortOption) => {
    switch (sortOption) {
      case "name":
        return "Name";
      case "role":
        return "Role";
      default:
        return "Date Joined";
    }
  }, []);

  const handleSortingChange: OnChangeFn<SortingState> = React.useCallback(
    (updater) => {
      const baseState = tableSorting;
      const nextState = typeof updater === "function" ? updater(baseState) : updater;
      if (!nextState || nextState.length === 0) {
        applySortingSelection("createdAt", "desc");
        return;
      }
      const primary = nextState[0];
      const nextSortOption: OrganizationUserSortOption =
        primary.id === "user" ? "name" : primary.id === "role" ? "role" : "createdAt";
      const nextSortDirection: OrganizationUserSortDirection = primary.desc ? "desc" : "asc";
      applySortingSelection(nextSortOption, nextSortDirection);
    },
    [applySortingSelection, tableSorting],
  );

  const handleSortDropdownChange = React.useCallback(
    (value: string) => {
      const [option, direction] = value.split(":");
      const nextSortOption: OrganizationUserSortOption =
        option === "name" || option === "role" || option === "createdAt" ? option : "createdAt";
      const nextSortDirection: OrganizationUserSortDirection = direction === "asc" ? "asc" : "desc";
      if (nextSortOption === sortBy && nextSortDirection === sortDirection) {
        return;
      }
      applySortingSelection(nextSortOption, nextSortDirection);
    },
    [applySortingSelection, sortBy, sortDirection],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const usersQuery = useQuery({
    ...convexQuery(api.users.listOrganizationUsersPaginated, {
      pageIndex,
      pageSize,
      search: debouncedSearch,
      roleFilter,
      sortBy,
      sortDirection,
      ...(workspaceScope?.queryArgs ?? {}),
    }),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const usersData = usersQuery.data as OrganizationUsersResponse | undefined;
  const organizationUsers = usersData?.users ?? [];
  const isUsersLoading = usersQuery.isLoading;

  const userStatsQuery = useQuery({
    ...convexQuery(api.users.getUserStats, {
      clerkUserId: isSignedIn ? (userId ?? "") : "",
      ...(workspaceScope?.queryArgs ?? {}),
    }),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const userStats = userStatsQuery.data;
  const updateUserRole = useMutation({
    mutationFn: useConvexAction(api.users.updateUserRoleWithClerk),
  });

  const promoteUserToOrganization = useMutation({
    mutationFn: useConvexAction(api.users.promoteUserToOrganizationWithClerk),
  });
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  const normalizeRole = React.useCallback((role: string) => role?.replace(/^org:/, "") || role, []);

  const clearAllFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    applySortingSelection("createdAt", "desc");
  };

  React.useEffect(() => {
    if (searchParams.get("page") === "0") {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "0");
    router.replace(`${usersPath}?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, roleFilter, router, searchParams, usersPath]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    roleFilter !== "all" ||
    sortBy !== "createdAt" ||
    sortDirection !== "desc";

  const getRoleIcon = React.useCallback(
    (role: string) => {
      const normalized = normalizeRole(role);
      switch (normalized) {
        case "admin":
          return <Crown className="h-4 w-4" />;
        case "host":
          return <Shield className="h-4 w-4" />;
        case "door":
          return <DoorOpen className="h-4 w-4" />;
        case "member":
          return <User className="h-4 w-4" />;
        case "guest":
          return <User className="h-4 w-4" />;
        default:
          return <User className="h-4 w-4" />;
      }
    },
    [normalizeRole],
  );

  const getRoleLabel = React.useCallback(
    (role: string) => {
      const normalized = normalizeRole(role);
      switch (normalized) {
        case "admin":
          return "Admin";
        case "host":
          return "Host";
        case "door":
          return "Door";
        case "member":
          return "Member";
        case "guest":
          return "Guest";
        default:
          return "Unknown";
      }
    },
    [normalizeRole],
  );

  const handlePaginationChange: OnChangeFn<PaginationState> = (updaterOrValue) => {
    const newPagination =
      typeof updaterOrValue === "function"
        ? updaterOrValue({ pageIndex, pageSize })
        : updaterOrValue;

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPagination.pageIndex.toString());
    params.set("pageSize", newPagination.pageSize.toString());
    router.replace(`${usersPath}?${params.toString()}`, { scroll: false });
  };

  const columns = React.useMemo<ColumnDef<OrganizationUserListItem>[]>(() => {
    const handleRoleChange = async (userId: Id<"users">, newRole: string, isGuest = false) => {
      try {
        if (isGuest) {
          if (!workspaceScope) {
            toast.error("Workspace scope is required to update roles");
            return;
          }
          await promoteUserToOrganization.mutateAsync({
            userId,
            role: newRole,
            ...workspaceScope.queryArgs,
          });
        } else {
          if (!workspaceScope) {
            toast.error("Workspace scope is required to update roles");
            return;
          }
          await updateUserRole.mutateAsync({
            userId,
            newRole,
            ...workspaceScope.queryArgs,
          });
        }

        setPendingChanges((prev) => {
          const updated = { ...prev };
          delete updated[userId];
          return updated;
        });

        toast.success(isGuest ? "User promoted successfully" : "User role updated successfully");
      } catch (error) {
        toast.error("Failed to update user role: " + (error as Error).message);
      }
    };
    return [
      {
        id: "user",
        header: "User",
        accessorFn: (row) => {
          const displayName = `${row.firstName || ""} ${row.lastName || ""}`.trim();
          return displayName || "Unknown User";
        },
        cell: ({ row }) => {
          const user = row.original;
          const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
          const userDetailPath = `${usersPath}/${user._id}`;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.imageUrl || undefined} />
                <AvatarFallback>{(user.firstName || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <Link
                  href={userDetailPath}
                  className="font-medium text-[var(--text-primary)] hover:underline"
                >
                  {displayName || "Unknown User"}
                </Link>
                <div className="text-xs text-[var(--text-secondary)]">
                  ID: {user.clerkUserId?.slice(-8) || "Unknown"}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "role",
        header: "Role",
        accessorKey: "role",
        cell: ({ row }) => {
          const user = row.original;
          const currentRole = pendingChanges[user._id] || user.role;
          const normalizedCurrentRole = normalizeRole(currentRole);

          if (normalizedCurrentRole === "guest") {
            return (
              <Badge
                variant="secondary"
                className="bg-[var(--surface-3)] text-[var(--text-primary)]"
              >
                <div className="flex items-center gap-1">
                  {getRoleIcon(currentRole)}
                  {getRoleLabel(currentRole)}
                </div>
              </Badge>
            );
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                >
                  <div className="flex items-center gap-1">
                    {getRoleIcon(normalizedCurrentRole)}
                    {getRoleLabel(normalizedCurrentRole)}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
                <DropdownMenuRadioGroup
                  value={currentRole}
                  onValueChange={(value) =>
                    setPendingChanges((prev) => ({
                      ...prev,
                      [user._id]: value,
                    }))
                  }
                >
                  <DropdownMenuRadioItem value="host" className="focus:bg-[var(--surface-3)]">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Host</span>
                    </div>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="door" className="focus:bg-[var(--surface-3)]">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="h-4 w-4" />
                      <span>Door</span>
                    </div>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="member" className="focus:bg-[var(--surface-3)]">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>Member</span>
                    </div>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="admin" className="focus:bg-[var(--surface-3)]">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4" />
                      <span>Admin</span>
                    </div>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "createdAt",
        header: "Joined",
        accessorKey: "createdAt",
        cell: ({ getValue }) => {
          const timestamp = getValue() as number;
          const date = new Date(timestamp);
          return <span className="text-[var(--text-secondary)]">{date.toLocaleDateString()}</span>;
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const user = row.original;
          const currentRole = pendingChanges[user._id] || user.role;
          const hasChanges = currentRole !== user.role;
          const normalizedUserRole = normalizeRole(user.role);

          if (normalizedUserRole === "guest" && !hasChanges) {
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-[var(--border-subtle)]"
                  >
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
                  <DropdownMenuItem
                    onClick={() => handleRoleChange(user._id, "host", true)}
                    className="focus:bg-[var(--surface-3)]"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Promote to Host
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRoleChange(user._id, "door", true)}
                    className="focus:bg-[var(--surface-3)]"
                  >
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Promote to Door
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRoleChange(user._id, "member", true)}
                    className="focus:bg-[var(--surface-3)]"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Promote to Member
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRoleChange(user._id, "admin", true)}
                    className="focus:bg-[var(--surface-3)]"
                  >
                    <Crown className="mr-2 h-4 w-4" />
                    Promote to Admin
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          } else if (hasChanges) {
            return (
              <Button
                size="sm"
                onClick={() =>
                  handleRoleChange(user._id, currentRole, normalizedUserRole === "guest")
                }
                className="text-xs"
              >
                Save
              </Button>
            );
          }
          return null;
        },
      },
    ];
  }, [
    getRoleIcon,
    getRoleLabel,
    normalizeRole,
    pendingChanges,
    promoteUserToOrganization,
    updateUserRole,
    usersPath,
    workspaceScope,
  ]);

  const table = useReactTable<OrganizationUserListItem>({
    data: organizationUsers,
    columns,
    state: { sorting: tableSorting, pagination: { pageIndex, pageSize } },
    autoResetPageIndex: false,
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: usersData?.pagination?.totalPages || 1,
  });

  return (
    <div className="flex-1 space-y-5">
      <DashboardTitleBar
        title="Users"
        subtitle="Manage organization member roles and permissions"
        breadcrumb={[{ label: "Workspace" }]}
      />

      {!userStats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg bg-[var(--surface-3)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <PageCard
            title="Total Users"
            description="All organization members"
            action={<Users className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {userStats.total}
            </div>
          </PageCard>
          <PageCard
            title="Admins"
            description="Full access users"
            action={<Crown className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {userStats.admin}
            </div>
          </PageCard>
          <PageCard
            title="Hosts"
            description="Host access"
            action={<Shield className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {userStats.host}
            </div>
          </PageCard>
          <PageCard
            title="Door"
            description="Door access"
            action={<DoorOpen className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {userStats.door}
            </div>
          </PageCard>
          <PageCard
            title="Members"
            description="Read access users"
            action={<User className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {userStats.member}
            </div>
          </PageCard>
        </div>
      )}

      <PageToolbar
        mobileFilterContent={
          <>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Role</label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectOption value="all">All Roles</SelectOption>
                <SelectOption value="admin">Admin</SelectOption>
                <SelectOption value="host">Host</SelectOption>
                <SelectOption value="door">Door</SelectOption>
                <SelectOption value="member">Member</SelectOption>
                <SelectOption value="guest">Guest</SelectOption>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Sort</label>
              <Select value={`${sortBy}:${sortDirection}`} onValueChange={handleSortDropdownChange}>
                <SelectOption value="createdAt:desc">Date Joined (Newest)</SelectOption>
                <SelectOption value="createdAt:asc">Date Joined (Oldest)</SelectOption>
                <SelectOption value="name:asc">Name (A–Z)</SelectOption>
                <SelectOption value="name:desc">Name (Z–A)</SelectOption>
                <SelectOption value="role:asc">Role (Admin → Guest)</SelectOption>
                <SelectOption value="role:desc">Role (Guest → Admin)</SelectOption>
              </Select>
            </div>
          </>
        }
      >
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={setRoleFilter}
          className="hidden w-32 sm:inline-flex"
        >
          <SelectOption value="all">All Roles</SelectOption>
          <SelectOption value="admin">Admin</SelectOption>
          <SelectOption value="host">Host</SelectOption>
          <SelectOption value="door">Door</SelectOption>
          <SelectOption value="member">Member</SelectOption>
          <SelectOption value="guest">Guest</SelectOption>
        </Select>
        <Select
          value={`${sortBy}:${sortDirection}`}
          onValueChange={handleSortDropdownChange}
          className="hidden w-56 sm:inline-flex"
        >
          <SelectOption value="createdAt:desc">Date Joined (Newest)</SelectOption>
          <SelectOption value="createdAt:asc">Date Joined (Oldest)</SelectOption>
          <SelectOption value="name:asc">Name (A–Z)</SelectOption>
          <SelectOption value="name:desc">Name (Z–A)</SelectOption>
          <SelectOption value="role:asc">Role (Admin → Guest)</SelectOption>
          <SelectOption value="role:desc">Role (Guest → Admin)</SelectOption>
        </Select>
        {hasActiveFilters ? (
          <Button
            size="sm"
            variant="outline"
            onClick={clearAllFilters}
            className="text-xs border-[var(--border-subtle)]"
          >
            Clear All
          </Button>
        ) : null}
        <div className="ml-auto hidden text-sm text-[var(--text-secondary)] sm:block">
          {usersData?.pagination ? (
            <>
              Showing {usersData.pagination.startIndex}-{usersData.pagination.endIndex} of{" "}
              {usersData.pagination.totalCount} users
            </>
          ) : (
            <>Showing {organizationUsers.length} users</>
          )}
        </div>
      </PageToolbar>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)]">Active filters:</span>
          {searchQuery.trim() !== "" && (
            <Badge
              variant="secondary"
              className="gap-1 bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              Search: \u201c{searchQuery}\u201d
              <button
                onClick={() => setSearchQuery("")}
                className="ml-1 rounded-full p-0.5 hover:bg-[var(--surface-3-strong)]"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {roleFilter !== "all" && (
            <Badge
              variant="secondary"
              className="gap-1 bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              Role: {roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}
              <button
                onClick={() => setRoleFilter("all")}
                className="ml-1 rounded-full p-0.5 hover:bg-[var(--surface-3-strong)]"
                aria-label="Clear role filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {(sortBy !== "createdAt" || sortDirection !== "desc") && (
            <Badge
              variant="secondary"
              className="gap-1 bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              Sort: {resolveSortLabel(sortBy)} {sortDirection === "desc" ? "(desc)" : "(asc)"}
              <button
                onClick={() => applySortingSelection("createdAt", "desc")}
                className="ml-1 rounded-full p-0.5 hover:bg-[var(--surface-3-strong)]"
                aria-label="Clear sort"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <span className="text-xs text-[var(--text-tertiary)]">
            {usersData?.pagination ? (
              <>
                ({usersData.pagination.startIndex}-{usersData.pagination.endIndex} of{" "}
                {usersData.pagination.totalCount} total users)
              </>
            ) : (
              <>(Showing {organizationUsers.length} users)</>
            )}
          </span>
        </div>
      ) : null}

      <Card className="border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-[var(--text-primary)]">All Users</CardTitle>
          <CardDescription className="text-[var(--text-secondary)]">
            Manage roles for organization members and promote event guests to staff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isUsersLoading ? (
            <TableSkeleton rows={10} columns={4} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr
                        key={headerGroup.id}
                        className="border-b border-[var(--border-subtle)] text-left text-[var(--text-secondary)]"
                      >
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className="cursor-pointer whitespace-nowrap px-2 py-3"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ??
                              null}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => {
                      const user = row.original;
                      const currentRole = pendingChanges[user._id] || user.role;
                      const hasChanges = currentRole !== user.role;

                      return (
                        <tr
                          key={row.id}
                          role="link"
                          tabIndex={0}
                          aria-label={`Open ${`${user.firstName || ""} ${user.lastName || ""}`.trim() || "user"} details`}
                          className={cn(
                            "cursor-pointer border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--text-primary)]/30",
                            hasChanges ? "bg-[var(--status-pending-bg)]" : "",
                          )}
                          onClick={(clickEvent) => {
                            if (
                              clickEvent.target instanceof Element &&
                              clickEvent.target.closest(
                                "button, a, input, select, textarea, [role='menuitem']",
                              )
                            ) {
                              return;
                            }
                            router.push(`${usersPath}/${user._id}`);
                          }}
                          onKeyDown={(keyboardEvent) => {
                            if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
                            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                              keyboardEvent.preventDefault();
                              router.push(`${usersPath}/${user._id}`);
                            }
                          }}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-2 py-3">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {table.getRowModel().rows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="mb-2 text-lg text-[var(--text-secondary)]">No users found</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {searchQuery
                      ? "Try adjusting your search query"
                      : "No users found in the system"}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--text-secondary)]">
          {usersData?.pagination ? (
            <>
              Page {pageIndex + 1} of {usersData.pagination.totalPages || 1}
            </>
          ) : (
            <>Page 1 of 1</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("pageSize", value);
              params.set("page", "0");
              router.replace(`${usersPath}?${params.toString()}`, {
                scroll: false,
              });
            }}
            className="w-24"
          >
            {[10, 20, 50, 100].map((number) => (
              <SelectOption key={number} value={String(number)}>
                {number} / page
              </SelectOption>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", (pageIndex - 1).toString());
              router.replace(`${usersPath}?${params.toString()}`, {
                scroll: false,
              });
            }}
            disabled={!usersData?.pagination?.hasPreviousPage}
            className="border-[var(--border-subtle)]"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", (pageIndex + 1).toString());
              router.replace(`${usersPath}?${params.toString()}`, {
                scroll: false,
              });
            }}
            disabled={!usersData?.pagination?.hasNextPage}
            className="border-[var(--border-subtle)]"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
