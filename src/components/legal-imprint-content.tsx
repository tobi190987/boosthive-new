import { imprintContent } from '@/lib/legal'

export function LegalImprintContent() {
  return (
    <div className="space-y-6 text-sm leading-7 text-slate-700 dark:text-slate-300">
      {imprintContent.sections.map((section) => (
        <section key={section.title} className="space-y-1">
          <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
            {section.title}
          </h2>
          {section.lines.map((line) => {
            const isLink = line.startsWith('https://')

            if (isLink) {
              return (
                <a
                  key={line}
                  href={line}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-blue-600 underline decoration-blue-300 underline-offset-4"
                >
                  {line.replace(/^https?:\/\//, '')}
                </a>
              )
            }

            return <p key={line}>{line}</p>
          })}
        </section>
      ))}
    </div>
  )
}
