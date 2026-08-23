"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  AuthInput,
  PasswordField,
  PhoneField,
} from "@/components/auth/controls";
import { roleLabel } from "@/lib/auth/roles";
import {
  bdMobileSchema,
  emailSchema,
  fullNameSchema,
  passwordSchema,
} from "@/lib/auth/schemas";
import {
  type AdminUser,
  type CreateUserPayload,
} from "@/lib/api/admin/users";
import type { Role, UserStatus } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { USER_STATUS_LABEL } from "./user-badges";

const CONTROL = "h-10 rounded-lg text-sm";

const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: bdMobileSchema,
  password: z
    .union([z.literal(""), passwordSchema])
    .transform((value) => (value === "" ? undefined : value)),
  role: z.enum(["ROLE_CUSTOMER", "ROLE_MODERATOR", "ROLE_ADMIN"]),
  sendEmail: z.boolean(),
});

type CreateUserValues = z.input<typeof createUserSchema>;
type CreateUserData = z.output<typeof createUserSchema>;

function assignableRoles(actor: Role | undefined): Role[] {
  if (actor === "ROLE_OWNER") return ["ROLE_CUSTOMER", "ROLE_MODERATOR", "ROLE_ADMIN"];
  if (actor === "ROLE_ADMIN") return ["ROLE_CUSTOMER", "ROLE_MODERATOR"];
  return [];
}

export function CreateUserDialog({
  open,
  actorRole,
  saving,
  generatedPassword,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  actorRole: Role | undefined;
  saving: boolean;
  generatedPassword: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: CreateUserPayload) => void;
}) {
  const roles = assignableRoles(actorRole);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-lg">
        {open ? (
          <CreateUserBody
            roles={roles}
            saving={saving}
            generatedPassword={generatedPassword}
            onCreate={onCreate}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateUserBody({
  roles,
  saving,
  generatedPassword,
  onCreate,
  onClose,
}: {
  roles: Role[];
  saving: boolean;
  generatedPassword: string | null;
  onCreate: (payload: CreateUserPayload) => void;
  onClose: () => void;
}) {
  const form = useForm<CreateUserValues, unknown, CreateUserData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      role: "ROLE_CUSTOMER",
      sendEmail: true,
    },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = form;
  const role = useWatch({ control, name: "role" }) ?? "ROLE_CUSTOMER";
  const sendEmail = useWatch({ control, name: "sendEmail" }) ?? true;

  function submit(values: CreateUserData) {
    onCreate({
      fullName: values.fullName,
      email: values.email,
      role: values.role,
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.password ? { password: values.password } : {}),
      sendEmail: values.sendEmail,
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create user</DialogTitle>
        <DialogDescription>
          Owner-only. Leave password empty to let the API generate and email one.
        </DialogDescription>
      </DialogHeader>

      {generatedPassword ? (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3">
          <p className="text-xs font-semibold text-success-foreground">
            Generated password
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md bg-background px-2 py-1.5 text-sm">
              {generatedPassword}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void navigator.clipboard.writeText(generatedPassword)}
              aria-label="Copy generated password"
              className="size-9 cursor-pointer rounded-lg"
            >
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit(submit)}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="-mr-1 min-h-0 overflow-y-auto px-1">
          <FieldGroup>
          <Field data-invalid={Boolean(errors.fullName)}>
            <FieldLabel htmlFor="create-name">Full name</FieldLabel>
            <AuthInput
              id="create-name"
              placeholder="Rahim Uddin"
              autoComplete="name"
              autoFocus
              aria-invalid={Boolean(errors.fullName)}
              {...register("fullName")}
            />
            <FieldError errors={[errors.fullName]} />
          </Field>

          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="create-email">Email</FieldLabel>
            <AuthInput
              id="create-email"
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="create-phone">Mobile (optional)</FieldLabel>
            <PhoneField
              id="create-phone"
              aria-invalid={Boolean(errors.phone)}
              {...register("phone")}
            />
            <FieldDescription>11 digits, starting with 01.</FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>

          <Field data-invalid={Boolean(errors.role)}>
            <FieldLabel htmlFor="create-role">Role</FieldLabel>
            <Select
              value={role}
              onValueChange={(next) =>
                setValue("role", next as CreateUserValues["role"], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger
                id="create-role"
                className="h-12 w-full cursor-pointer rounded-field text-base data-[size=default]:h-12 md:text-sm"
              >
                <SelectValue>{(current) => roleLabel(current as Role)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {roleLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="create-password">Password (optional)</FieldLabel>
            <PasswordField
              id="create-password"
              placeholder="Generate automatically"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldDescription>
              Leave blank to generate one. Typed passwords need 8+ characters
              with upper, lower and number.
            </FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
            <Checkbox
              checked={sendEmail}
              onCheckedChange={(next) =>
                setValue("sendEmail", next === true, { shouldDirty: true })
              }
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Send welcome email</span>
              <span className="text-xs text-muted-foreground">
                The API emails generated credentials when a password is omitted.
              </span>
            </span>
          </label>
          </FieldGroup>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-11 cursor-pointer rounded-field"
          >
            Close
          </Button>
          <Button
            type="submit"
            disabled={saving || !roles.includes(role)}
            className="h-11 cursor-pointer gap-2 rounded-field font-semibold"
          >
            {saving ? <Spinner /> : null}
            {saving ? "Creating..." : "Create user"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DeleteUserDialog({
  user,
  onClose,
  onConfirm,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onConfirm: (user: AdminUser) => void;
}) {
  return (
    <AlertDialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user?.fullName}?</AlertDialogTitle>
          <AlertDialogDescription>
            The account is marked deleted and signed out, but its row remains so
            orders and audit trails keep resolving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => user && onConfirm(user)}
            className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90"
          >
            Delete user
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ChangeUserRoleDialog({
  pending,
  saving,
  onClose,
  onConfirm,
}: {
  pending: { user: AdminUser; role: Role } | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (pending: { user: AdminUser; role: Role }) => void;
}) {
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Change role for {pending?.user.fullName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This changes their access level to{" "}
            <strong>{pending ? roleLabel(pending.role) : ""}</strong> and signs
            their current sessions out so the new permissions apply on the next
            request.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={() => pending && onConfirm(pending)}
            className="cursor-pointer rounded-lg"
          >
            {saving ? "Updating..." : "Change role"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ChangeUserStatusDialog({
  pending,
  saving,
  onClose,
  onConfirm,
}: {
  pending: {
    user: AdminUser;
    status: Extract<UserStatus, "ACTIVE" | "SUSPENDED">;
  } | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (pending: {
    user: AdminUser;
    status: Extract<UserStatus, "ACTIVE" | "SUSPENDED">;
  }) => void;
}) {
  const action =
    pending?.status === "ACTIVE"
      ? pending.user.status === "DELETED"
        ? "restore"
        : "reactivate"
      : "suspend";

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action[0]?.toUpperCase()}
            {action.slice(1)} {pending?.user.fullName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This sets the account status to{" "}
            <strong>
              {pending ? USER_STATUS_LABEL[pending.status] : ""}
            </strong>
            {pending?.status === "SUSPENDED"
              ? " and signs the user out of every active session."
              : pending?.user.status === "DELETED"
                ? " and clears the deletion marker so the account returns to normal listings."
                : "."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={() => pending && onConfirm(pending)}
            className="cursor-pointer rounded-lg"
          >
            {saving ? "Updating..." : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DestroyUserDialog({
  user,
  onClose,
  onConfirm,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onConfirm: (user: AdminUser) => void;
}) {
  return (
    <AlertDialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        {user ? (
          <DestroyUserBody
            key={user.id}
            user={user}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DestroyUserBody({
  user,
  onClose,
  onConfirm,
}: {
  user: AdminUser;
  onClose: () => void;
  onConfirm: (user: AdminUser) => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Permanently delete {user.fullName}?</AlertDialogTitle>
        <AlertDialogDescription>
          This removes the account document outright and frees the email address
          for reuse. There is no restore path.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <ConfirmField
        label={`Type ${user.email} to confirm`}
        htmlFor="confirm-user-email"
      >
        <Input
          id="confirm-user-email"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className={CONTROL}
        />
      </ConfirmField>
      <AlertDialogFooter>
        <Button variant="ghost" onClick={onClose} className="h-10 cursor-pointer rounded-lg">
          Cancel
        </Button>
        <Button
          disabled={!matches}
          onClick={() => onConfirm(user)}
          className="h-10 cursor-pointer rounded-lg bg-destructive px-4 text-white hover:bg-destructive/90"
        >
          Delete forever
        </Button>
      </AlertDialogFooter>
    </>
  );
}

function ConfirmField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
