import Link from 'next/link'

export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f7f2e9_0%,#f1eee8_52%,#eaf5f2_100%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[36px] border border-[#dfd5c8] bg-[#fffdf9] p-8 shadow-[0_24px_80px_rgba(89,71,42,0.12)] sm:p-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
                Impressum
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Angaben gemäß § 5 TMG
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                Hier findest du die rechtlichen Pflichtangaben für die temporäre Vorschaltseite.
              </p>
            </div>

            <div className="space-y-6 text-sm leading-7 text-slate-700">
              <div>
                <p className="font-semibold text-slate-950">Ringelsiep/Wollenweber GbR</p>
                <p>Rathoffsweg 7</p>
                <p>44379 Dortmund</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950">Vertreten durch</p>
                <p>Daniel Ringelsiep &amp; Tobias Wollenweber</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950">Kontakt</p>
                <p>Telefon: 0208 20585264</p>
                <p>E-Mail: service@digitalbee.de</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950">Umsatzsteuer-ID</p>
                <p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: DE3121322</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950">EU-Streitschlichtung</p>
                <p>
                  Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung
                  bereit:
                </p>
                <a
                  href="https://ec.europa.eu/consumers/odr/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#b85e34] underline decoration-[#d7a182] underline-offset-4"
                >
                  ec.europa.eu/consumers/odr/
                </a>
                <p>Unsere E-Mail-Adresse findest du oben im Impressum.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-950">
                  Verbraucherstreitbeilegung / Universalschlichtungsstelle
                </p>
                <p>
                  Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
                  Verbraucherschlichtungsstelle teilzunehmen.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-[#ece2d5] pt-6 text-sm text-slate-600">
              <Link
                href="/access"
                className="font-medium text-[#b85e34] underline decoration-[#d7a182] underline-offset-4"
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
