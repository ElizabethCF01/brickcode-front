export default function Attribution() {
  return (
    <div className="px-4 py-1 bg-surface border-t border-line text-[10px] leading-snug text-ink-muted text-center shrink-0">
      Parts: <a
        href="https://library.ldraw.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-ink"
      >LDraw™ Parts Library</a> under{' '}
      <a
        href="https://creativecommons.org/licenses/by/2.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-ink"
      >CC BY 2.0</a>.
      LDraw™ is a trademark of the Estate of James Jessiman.
      LEGO® is a trademark of The LEGO Group, which does not sponsor, endorse, or authorize this project.
    </div>
  )
}
