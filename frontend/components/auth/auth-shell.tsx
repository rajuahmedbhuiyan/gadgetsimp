import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Plain shell every auth page sits in. Layout only - no logic. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer ? (
          <CardFooter className="flex-col items-start gap-2 text-sm text-muted-foreground">
            {footer}
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
