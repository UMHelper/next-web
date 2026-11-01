export function ToolFailureAlert({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      role="alert"
    >
      <p>{message}</p>
    </div>
  );
}
