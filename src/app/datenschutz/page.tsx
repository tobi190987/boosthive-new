import Link from 'next/link'

export default function DatenschutzPage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-10 dark:bg-[#0b1120] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] p-8 shadow-soft sm:p-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
                Datenschutz
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                Datenschutzerklärung
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                Hier findest du die Datenschutzangaben für die temporäre Zugriffsschranke.
              </p>
            </div>

            <div className="space-y-6 text-sm leading-7 text-slate-700 dark:text-slate-300">
              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">1. Datenschutz auf einen Blick</h2>
                <p>
                  Beim Besuch dieser Website werden personenbezogene Daten verarbeitet. Das betrifft
                  insbesondere technische Zugriffsdaten, freiwillige Angaben bei einer
                  Kontaktaufnahme sowie Nutzungsdaten, die für den sicheren Betrieb und die Analyse
                  des Angebots erforderlich sind.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                  2. Hinweis zur verantwortlichen Stelle
                </h2>
                <p>Verantwortlich für die Datenverarbeitung ist die Ringelsiep/Wollenweber GbR.</p>
                <p>Rathoffsweg 7, 44379 Dortmund</p>
                <p>E-Mail: service@digitalbee.de</p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">3. Speicherdauer</h2>
                <p>
                  Personenbezogene Daten werden nur so lange gespeichert, wie es für den jeweiligen
                  Verarbeitungszweck erforderlich ist oder gesetzliche Aufbewahrungspflichten eine
                  längere Speicherung verlangen.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">4. Ihre Rechte</h2>
                <p>
                  Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
                  Verarbeitung, Datenübertragbarkeit und Widerspruch gegen bestimmte
                  Verarbeitungen. Erteilte Einwilligungen können jederzeit mit Wirkung für die
                  Zukunft widerrufen werden. Außerdem besteht ein Beschwerderecht bei der
                  zuständigen Aufsichtsbehörde.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">5. Server-Log-Dateien</h2>
                <p>
                  Der Hosting-Provider erhebt und speichert automatisch Informationen in
                  Server-Log-Dateien, etwa Browsertyp, Betriebssystem, Referrer-URL, Uhrzeit der
                  Serveranfrage und IP-Adresse, soweit dies technisch erforderlich ist.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">6. Kontaktaufnahme</h2>
                <p>
                  Wenn du per Formular, E-Mail, Telefon oder Telefax Kontakt aufnimmst, werden
                  deine Angaben zur Bearbeitung der Anfrage und für mögliche Anschlussfragen
                  gespeichert.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                  7. Analyse und eingebundene Dienste
                </h2>
                <p>
                  Laut DigitalBee werden Dienste wie Matomo zur Reichweitenmessung sowie lokal
                  gehostete Google Fonts eingesetzt.
                </p>
              </section>
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
