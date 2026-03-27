import Link from 'next/link'

export default function DatenschutzPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f7f2e9_0%,#f1eee8_52%,#eaf5f2_100%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[36px] border border-[#dfd5c8] bg-[#fffdf9] p-8 shadow-[0_24px_80px_rgba(89,71,42,0.12)] sm:p-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
                Datenschutz
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Datenschutzerklärung
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                Hier findest du die Datenschutzangaben für die temporäre Zugriffsschranke.
              </p>
            </div>

            <div className="space-y-6 text-sm leading-7 text-slate-700">
              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950">1. Datenschutz auf einen Blick</h2>
                <p>
                  Beim Besuch dieser Website werden personenbezogene Daten verarbeitet. Das betrifft
                  insbesondere technische Zugriffsdaten, freiwillige Angaben bei einer
                  Kontaktaufnahme sowie Nutzungsdaten, die für den sicheren Betrieb und die Analyse
                  des Angebots erforderlich sind.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950">
                  2. Hinweis zur verantwortlichen Stelle
                </h2>
                <p>Verantwortlich für die Datenverarbeitung ist die Ringelsiep/Wollenweber GbR.</p>
                <p>Rathoffsweg 7, 44379 Dortmund</p>
                <p>E-Mail: service@digitalbee.de</p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950">3. Speicherdauer</h2>
                <p>
                  Personenbezogene Daten werden nur so lange gespeichert, wie es für den jeweiligen
                  Verarbeitungszweck erforderlich ist oder gesetzliche Aufbewahrungspflichten eine
                  längere Speicherung verlangen.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950">4. Ihre Rechte</h2>
                <p>
                  Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
                  Verarbeitung, Datenübertragbarkeit und Widerspruch gegen bestimmte
                  Verarbeitungen. Erteilte Einwilligungen können jederzeit mit Wirkung für die
                  Zukunft widerrufen werden. Außerdem besteht ein Beschwerderecht bei der
                  zuständigen Aufsichtsbehörde.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950">5. Server-Log-Dateien</h2>
                <p>
                  Der Hosting-Provider erhebt und speichert automatisch Informationen in
                  Server-Log-Dateien, etwa Browsertyp, Betriebssystem, Referrer-URL, Uhrzeit der
                  Serveranfrage und IP-Adresse, soweit dies technisch erforderlich ist.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950">6. Kontaktaufnahme</h2>
                <p>
                  Wenn du per Formular, E-Mail, Telefon oder Telefax Kontakt aufnimmst, werden
                  deine Angaben zur Bearbeitung der Anfrage und für mögliche Anschlussfragen
                  gespeichert.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-950">
                  7. Analyse und eingebundene Dienste
                </h2>
                <p>
                  Laut DigitalBee werden Dienste wie Matomo zur Reichweitenmessung sowie lokal
                  gehostete Google Fonts eingesetzt.
                </p>
              </section>
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
