"use client";

import { Shield, ShieldCheck, ShieldUser, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/auth/roles";
import type { Role, UserStatus } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  DELETED: "Deleted",
};

export function UserRoleBadge({ role }: { role: Role }) {
  const Icon =
    role === "ROLE_OWNER"
      ? ShieldCheck
      : role === "ROLE_ADMIN"
        ? Shield
        : role === "ROLE_MODERATOR"
          ? ShieldUser
          : UserRound;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full px-2.5 py-1 text-xs",
        role === "ROLE_OWNER" && "border-brand/40 bg-brand/10",
        role === "ROLE_ADMIN" && "border-primary/35 bg-primary/8",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {roleLabel(role)}
    </Badge>
  );
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge
      className={cn(
        "rounded-full px-2.5 py-1 text-xs",
        status === "ACTIVE" && "bg-success text-success-foreground",
        status === "SUSPENDED" && "bg-warning text-warning-foreground",
        status === "DELETED" && "bg-destructive text-white",
      )}
    >
      {USER_STATUS_LABEL[status]}
    </Badge>
  );
}
