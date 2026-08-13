import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The envelope's top-level `message`, shown above the form. Field-level
 * `errors[]` go on their own controls instead.
 */
export function FormAlert({
  message,
  variant = "destructive",
  children,
}: {
  message: string;
  variant?: "default" | "destructive";
  children?: React.ReactNode;
}) {
  return (
    <Alert variant={variant} className="mb-4">
      <AlertTitle>{message}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  );
}
