export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-hairline bg-card p-6">
        <h1 className="mb-5 font-display text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
