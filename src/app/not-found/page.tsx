export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4 max-w-md px-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-2xl font-semibold">Subdomain nicht gefunden</h2>
        <p className="text-muted-foreground">
          Diese Subdomain ist nicht registriert. Bitte überprüfe die URL oder
          kontaktiere deinen Administrator.
        </p>
        <a
          href="/"
          className="inline-block mt-4 text-sm underline underline-offset-4 hover:text-primary"
        >
          Zurück zur Startseite
        </a>
      </div>
    </div>
  )
}
