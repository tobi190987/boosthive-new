import { PreviewAccessForm } from '@/components/preview-access-form'

interface AccessPageProps {
  searchParams: Promise<{ returnTo?: string }>
}

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-background p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-slate-900 dark:text-slate-100">
          Zugang erforderlich
        </h1>
        <PreviewAccessForm returnTo={params.returnTo} />
      </div>
    </div>
  )
}
