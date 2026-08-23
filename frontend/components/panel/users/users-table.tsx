"use client";

import { useState } from "react";
import {
  BadgeCheck,
  BadgeX,
  CalendarDays,
  Clock,
  Hash,
  Mail,
  MoreHorizontal,
  Phone,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/auth/roles";
import type { UserPermissions } from "@/lib/panel/permissions";
import {
  USER_WRITABLE_STATUSES,
  type AdminUser,
} from "@/lib/api/admin/users";
import type { Role, UserStatus } from "@/lib/api/types";
import { UserAvatar } from "@/components/auth/user-avatar";
import { PanelMenuBackdrop } from "@/components/panel/menu-backdrop";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRoleBadge, UserStatusBadge } from "./user-badges";

function dateTime(value: string | null | undefined) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function assignableRoles(actorRole: Role | undefined, current: Role): Role[] {
  const options =
    actorRole === "ROLE_OWNER"
      ? ["ROLE_CUSTOMER", "ROLE_MODERATOR", "ROLE_ADMIN"]
      : actorRole === "ROLE_ADMIN"
        ? ["ROLE_CUSTOMER", "ROLE_MODERATOR"]
        : [];

  return options.filter((role): role is Role => role !== current);
}

const ROLE_RANK: Record<Role, number> = {
  ROLE_CUSTOMER: 0,
  ROLE_MODERATOR: 1,
  ROLE_ADMIN: 2,
  ROLE_OWNER: 3,
};

function canModify(
  user: AdminUser,
  actorId: number | undefined,
  actorRole: Role | undefined,
) {
  if (!actorRole || user.id === actorId) return false;
  if (user.role === "ROLE_CUSTOMER") return true;
  return ROLE_RANK[user.role] < ROLE_RANK[actorRole];
}

export function UsersTable({
  users,
  actorId,
  actorRole,
  permissions,
  busy,
  onChangeRole,
  onChangeStatus,
  onDelete,
  onDestroy,
}: {
  users: AdminUser[];
  actorId: number | undefined;
  actorRole: Role | undefined;
  permissions: UserPermissions;
  busy: boolean;
  onChangeRole: (user: AdminUser, role: Role) => void;
  onChangeStatus: (
    user: AdminUser,
    status: Extract<UserStatus, "ACTIVE" | "SUSPENDED">,
  ) => void;
  onDelete: (user: AdminUser) => void;
  onDestroy: (user: AdminUser) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "hidden min-h-0 flex-1 rounded-xl border bg-card lg:block",
          "[&>[data-slot=table-container]]:h-full",
          "[&>[data-slot=table-container]]:overflow-auto",
          busy && "opacity-60",
        )}
      >
        <Table className="min-w-[1180px]">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Providers</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-12 pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="pl-4">
                  <UserIdentity user={user} />
                </TableCell>
                <TableCell>
                  <EmailLink user={user} />
                </TableCell>
                <TableCell>
                  <PhoneLink user={user} />
                </TableCell>
                <TableCell>
                  <UserRoleBadge role={user.role} />
                </TableCell>
                <TableCell>
                  <UserStatusBadge status={user.status} />
                </TableCell>
                <TableCell>
                  <VerifiedLine user={user} />
                </TableCell>
                <TableCell>
                  <ProviderLine user={user} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateTime(user.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateTime(user.lastLoginAt)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <UserActions
                    user={user}
                    actorId={actorId}
                    actorRole={actorRole}
                    permissions={permissions}
                    onChangeRole={onChangeRole}
                    onChangeStatus={onChangeStatus}
                    onDelete={onDelete}
                    onDestroy={onDestroy}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className={cn("grid gap-3 lg:hidden", busy && "opacity-60")}>
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <UserIdentity user={user} />
              <UserActions
                user={user}
                actorId={actorId}
                actorRole={actorRole}
                permissions={permissions}
                onChangeRole={onChangeRole}
                onChangeStatus={onChangeStatus}
                onDelete={onDelete}
                onDestroy={onDestroy}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <UserRoleBadge role={user.role} />
              <UserStatusBadge status={user.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ContactButton href={`mailto:${user.email}`} icon={Mail}>
                Email
              </ContactButton>
              {user.phone ? (
                <ContactButton href={`tel:${phoneHref(user.phone)}`} icon={Phone}>
                  Call
                </ContactButton>
              ) : (
                <span className="flex h-10 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                  No phone
                </span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Hash className="size-3" aria-hidden />
                  Account ID
                </dt>
                <dd className="mt-0.5 font-medium tabular-nums">#{user.id}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-muted-foreground">
                  {user.emailVerifiedAt ? (
                    <BadgeCheck className="size-3" aria-hidden />
                  ) : (
                    <BadgeX className="size-3" aria-hidden />
                  )}
                  Email
                </dt>
                <dd className="mt-0.5 font-medium">
                  {user.emailVerifiedAt ? "Verified" : "Unverified"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <CalendarDays className="size-3" aria-hidden />
                  Joined
                </dt>
                <dd className="mt-0.5 font-medium">{dateTime(user.createdAt)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-3" aria-hidden />
                  Last login
                </dt>
                <dd className="mt-0.5 font-medium">{dateTime(user.lastLoginAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Providers</dt>
                <dd className="mt-0.5 font-medium">{providerText(user)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5 font-medium">{dateTime(user.updatedAt)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function UserIdentity({ user }: { user: AdminUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar user={user} className="size-10 shrink-0" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{user.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">#{user.id}</p>
      </div>
    </div>
  );
}

function phoneHref(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function providerText(user: AdminUser) {
  return user.authProviders.length > 0
    ? user.authProviders.map((provider) => provider.toLowerCase()).join(", ")
    : "None";
}

function EmailLink({ user }: { user: AdminUser }) {
  return (
    <a
      href={`mailto:${user.email}`}
      className="inline-flex min-w-0 max-w-64 items-center gap-1.5 text-xs text-foreground hover:text-brand"
    >
      <Mail className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{user.email}</span>
    </a>
  );
}

function PhoneLink({ user }: { user: AdminUser }) {
  if (!user.phone) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Phone className="size-3.5" aria-hidden />
        No phone
      </span>
    );
  }

  return (
    <a
      href={`tel:${phoneHref(user.phone)}`}
      className="inline-flex min-w-0 max-w-40 items-center gap-1.5 text-xs text-foreground hover:text-brand"
    >
      <Phone className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{user.phone}</span>
    </a>
  );
}

function VerifiedLine({ user }: { user: AdminUser }) {
  const Icon = user.emailVerifiedAt ? BadgeCheck : BadgeX;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        user.emailVerifiedAt ? "text-success-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {user.emailVerifiedAt ? dateTime(user.emailVerifiedAt) : "Unverified"}
    </span>
  );
}

function ProviderLine({ user }: { user: AdminUser }) {
  return (
    <span className="text-xs text-muted-foreground capitalize">
      {providerText(user)}
    </span>
  );
}

function ContactButton({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors active:bg-muted"
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </a>
  );
}

function UserActions({
  user,
  actorId,
  actorRole,
  permissions,
  onChangeRole,
  onChangeStatus,
  onDelete,
  onDestroy,
}: {
  user: AdminUser;
  actorId: number | undefined;
  actorRole: Role | undefined;
  permissions: UserPermissions;
  onChangeRole: (user: AdminUser, role: Role) => void;
  onChangeStatus: (
    user: AdminUser,
    status: Extract<UserStatus, "ACTIVE" | "SUSPENDED">,
  ) => void;
  onDelete: (user: AdminUser) => void;
  onDestroy: (user: AdminUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const modifiable = canModify(user, actorId, actorRole);
  const roleOptions = assignableRoles(actorRole, user.role);
  const statusOptions = USER_WRITABLE_STATUSES.filter(
    (status) => status !== user.status,
  );
  const hasActions =
    (permissions.changeRole && modifiable && roleOptions.length > 0) ||
    (permissions.changeStatus && modifiable && statusOptions.length > 0) ||
    (permissions.remove && modifiable && user.status !== "DELETED") ||
    (permissions.destroy && modifiable);

  if (!hasActions) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        aria-label="No actions available"
        className="size-9 rounded-lg"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {open ? <PanelMenuBackdrop onClick={() => setOpen(false)} /> : null}
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${user.fullName}`}
            className="size-9 cursor-pointer rounded-lg"
          />
        }
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {permissions.changeRole && modifiable && roleOptions.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Change role
            </DropdownMenuLabel>
            {roleOptions.map((role) => (
              <DropdownMenuItem
                key={role}
                onClick={() => onChangeRole(user, role)}
                className="cursor-pointer"
              >
                <ShieldCheck />
                {roleLabel(role)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}

        {permissions.changeStatus && modifiable && statusOptions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Account status
              </DropdownMenuLabel>
              {statusOptions.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => onChangeStatus(user, status)}
                  className="cursor-pointer"
                >
                  {status === "ACTIVE" ? <UserCheck /> : <UserMinus />}
                  {status === "ACTIVE" ? "Reactivate" : "Suspend"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}

        {(permissions.remove && modifiable && user.status !== "DELETED") ||
        (permissions.destroy && modifiable) ? (
          <>
            <DropdownMenuSeparator />
            {permissions.remove && modifiable && user.status !== "DELETED" ? (
              <DropdownMenuItem
                onClick={() => onDelete(user)}
                className="cursor-pointer text-destructive data-highlighted:text-destructive"
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            ) : null}
            {permissions.destroy && modifiable ? (
              <DropdownMenuItem
                onClick={() => onDestroy(user)}
                className="cursor-pointer text-destructive data-highlighted:text-destructive"
              >
                <XCircle />
                Delete forever
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
