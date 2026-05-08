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
import { Crown, DoorOpen, Filter, Search, Shield, User, Users, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { toast } from "sonner";
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

  // Read pagination directly from URL params
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

  // Normalize role by stripping org: prefix
  const normalizeRole = React.useCallback((role: string) => role?.replace(/^org:/, "") || role, []);

  // Clear all filters function
  const clearAllFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    applySortingSelection("createdAt", "desc");
  };

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "0");
    router.replace(`${usersPath}?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, roleFilter, router, searchParams, usersPath]);

  // Check if any filters are active
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
        case "member":
          return <DoorOpen className="h-4 w-4" />;
        case "guest":
          return <User className="h-4 w-4" />;
        default:
          return <User className="h-4 w-4" />;
      }
    },
    [normalizeRole],
  );

  const getRoleColor = React.useCallback(
    (role: string) => {
      const normalized = normalizeRole(role);
      switch (normalized) {
        case "admin":
          return "text-yellow-700 border-yellow-200 bg-yellow-50";
        case "host":
          return "text-blue-700 border-blue-200 bg-blue-50";
        case "door":
        case "member":
          return "text-teal-700 border-teal-200 bg-teal-50";
        case "guest":
          return "text-gray-700 border-gray-200 bg-gray-50";
        default:
          return "text-gray-700 border-gray-200 bg-gray-50";
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
        case "member":
          return "Door";
        case "guest":
          return "Guest";
        default:
          return "Unknown";
      }
    },
    [normalizeRole],
  );

  // Pagination change handler that updates URL
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

  // Define table columns
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

        // Clear pending changes for this user
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
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.imageUrl || undefined} />
                <AvatarFallback>{(user.firstName || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{displayName || "Unknown User"}</div>
                <div className="text-xs text-muted-foreground">
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
          const _hasChanges = currentRole !== user.role;
          const normalizedCurrentRole = normalizeRole(currentRole);

          if (normalizedCurrentRole === "guest") {
            return (
              <Badge variant="outline" className={cn(getRoleColor(currentRole))}>
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
                  className={cn(getRoleColor(normalizedCurrentRole))}
                >
                  <div className="flex items-center gap-1">
                    {getRoleIcon(normalizedCurrentRole)}
                    {getRoleLabel(normalizedCurrentRole)}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={currentRole}
                  onValueChange={(value) =>
                    setPendingChanges((prev) => ({
                      ...prev,
                      [user._id]: value,
                    }))
                  }
                >
                  <DropdownMenuRadioItem value="host">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Host</span>
                    </div>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="door">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="h-4 w-4" />
                      <span>Door</span>
                    </div>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="admin">
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
          return <span className="text-muted-foreground">{date.toLocaleDateString()}</span>;
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
                  <Button variant="outline" size="sm" className="text-xs">
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleRoleChange(user._id, "host", true)}>
                    <Shield className="mr-2 h-4 w-4" />
                    Promote to Host
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRoleChange(user._id, "door", true)}>
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Promote to Door
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRoleChange(user._id, "admin", true)}>
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
    getRoleColor,
    getRoleIcon,
    getRoleLabel,
    normalizeRole,
    pendingChanges,
    promoteUserToOrganization,
    updateUserRole,
    workspaceScope,
  ]);

  // useReactTable returns a mutable instance with non-memoizable callbacks; suppress lint warning.
  // eslint-disable-next-line react-hooks/incompatible-library
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
    <div className="flex-1 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">Manage organization member roles and permissions</p>
        </div>
      </div>

      {/* Stats Cards */}
      {!userStats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 w-32 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.total}</div>
              <p className="text-xs text-muted-foreground">All organization members</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Crown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.admin}</div>
              <p className="text-xs text-muted-foreground">Full access users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hosts</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.host}</div>
              <p className="text-xs text-muted-foreground">Host access</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Door</CardTitle>
              <DoorOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.door}</div>
              <p className="text-xs text-muted-foreground">Door access</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Organization</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.organizationMembers}</div>
              <p className="text-xs text-muted-foreground">Total staff</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {usersData?.pagination ? (
            <>
              Showing {usersData.pagination.startIndex}-{usersData.pagination.endIndex} of{" "}
              {usersData.pagination.totalCount} users
            </>
          ) : (
            <>Showing {organizationUsers.length} users</>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={roleFilter} onValueChange={setRoleFilter} className="w-32">
          <SelectOption value="all">All Roles</SelectOption>
          <SelectOption value="admin">Admin</SelectOption>
          <SelectOption value="host">Host</SelectOption>
          <SelectOption value="door">Door</SelectOption>
          <SelectOption value="guest">Guest</SelectOption>
        </Select>
        <Select
          value={`${sortBy}:${sortDirection}`}
          onValueChange={handleSortDropdownChange}
          className="w-56"
        >
          <SelectOption value="createdAt:desc">Date Joined (Newest)</SelectOption>
          <SelectOption value="createdAt:asc">Date Joined (Oldest)</SelectOption>
          <SelectOption value="name:asc">Name (A–Z)</SelectOption>
          <SelectOption value="name:desc">Name (Z–A)</SelectOption>
          <SelectOption value="role:asc">Role (Admin → Guest)</SelectOption>
          <SelectOption value="role:desc">Role (Guest → Admin)</SelectOption>
        </Select>
        {hasActiveFilters && (
          <Button size="sm" variant="outline" onClick={clearAllFilters} className="text-xs">
            Clear All
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm text-foreground/70">Active filters:</span>
          {searchQuery.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Search: &ldquo;{searchQuery}&rdquo;
              <button
                onClick={() => setSearchQuery("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {roleFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Role: {roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}
              <button
                onClick={() => setRoleFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {(sortBy !== "createdAt" || sortDirection !== "desc") && (
            <Badge variant="secondary" className="gap-1">
              Sort: {resolveSortLabel(sortBy)}
              {sortDirection === "desc" ? " (desc)" : " (asc)"}
              <button
                onClick={() => applySortingSelection("createdAt", "desc")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <span className="text-xs text-foreground/60">
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
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
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
                      <tr key={headerGroup.id} className="text-left text-foreground/70 border-b">
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className="px-2 py-3 cursor-pointer"
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
                          className={cn(
                            "border-b border-foreground/10",
                            hasChanges ? "bg-yellow-50 border-yellow-200" : "",
                          )}
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
                  <p className="text-lg text-muted-foreground mb-2">No users found</p>
                  <p className="text-sm text-muted-foreground">
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

      {/* Pagination Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-foreground/70">
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
              params.set("page", "0"); // Reset to first page when changing page size
              router.replace(`${usersPath}?${params.toString()}`, {
                scroll: false,
              });
            }}
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
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
