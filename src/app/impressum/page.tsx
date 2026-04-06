import Link from 'next/link'

export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-10 dark:bg-[#0b1120] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] p-8 shadow-soft sm:p-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
                Impressum
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                Angaben gemäß § 5 TMG
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                Hier findest du die rechtlichen Pflichtangaben für die temporäre Vorschaltseite.
              </p>
            </div>

            <div className="space-y-6 text-sm leading-7 text-slate-700 dark:text-slate-300">
              <div>
                <p className="font-semibold text-slate-950 dark:text-slate-50">Ringelsiep/Wollenweber GbR</p>
                <p>Rathoffsweg 7</p>
                <p>44379 Dortmund</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950 dark:text-slate-50">Vertreten durch</p>
                <p>Daniel Ringelsiep &amp; Tobias Wollenweber</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950 dark:text-slate-50">Kontakt</p>
                <p>Telefon: 0208 20585264</p>
                <p>E-Mail: service@digitalbee.de</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950 dark:text-slate-50">Umsatzsteuer-ID</p>
                <p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: DE3121322</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950 dark:text-slate-50">EU-Streitschlichtung</p>
                <p>
                  Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung
                  bereit:
                </p>
                <a
                  href="https://ec.europa.eu/consumers/odr/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline decoration-blue-300 underline-offset-4"
                >
                  ec.europa.eu/consumers/odr/
                </a>
                <p>Unsere E-Mail-Adresse findest du oben im Impressum.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950 dark:text-slate-50">
                  Verbraucherstreitbeilegung / Universalschlichtungsstelle
                </p>
                <p>
                  Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
                  Verbraucherschlichtungsstelle teilzunehmen.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 dark:border-[#252d3a] pt-6 text-sm text-slate-600 dark:text-slate-300">
              <Link
                href="/access"
                className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-4"
              >
                Zurück zur Access-Seite
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
