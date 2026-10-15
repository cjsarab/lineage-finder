// Settings → About: version, index format, the legal note, where the guide and the licences are.
import type { Status } from "@/lib/server"
import { SectionTitle } from "./settings-panel"

export function AboutSection({ status }: { status: Status }) {
  return (
    <section className="space-y-2">
      <SectionTitle>About</SectionTitle>
      <p>
        Lineage Finder {status.app.version} · index v{status.app.indexFormat}
      </p>
      <p className="text-muted-foreground">Unofficial: not affiliated with or endorsed by Ellucian.</p>
      <p className="text-muted-foreground">
        Guide: <span className="font-names">HOW-TO-RUN.txt</span> in the app folder
      </p>
      <p className="text-muted-foreground">
        Licences: <span className="font-names">LICENSE</span> and <span className="font-names">THIRD-PARTY-NOTICES.txt</span> in
        the app folder
      </p>
    </section>
  )
}
