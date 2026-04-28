export default function Attribution() {
  return (
    <div className="px-4 py-1 bg-gray-900 border-t border-gray-800 text-[10px] leading-snug text-gray-500 text-center shrink-0">
      Piezas: <a
        href="https://library.ldraw.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gray-300"
      >LDraw™ Parts Library</a> bajo{' '}
      <a
        href="https://creativecommons.org/licenses/by/2.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gray-300"
      >CC BY 2.0</a>.
      LDraw™ es marca registrada de la Estate of James Jessiman.
      LEGO® es marca registrada de The LEGO Group, que no patrocina, avala ni autoriza este proyecto.
    </div>
  )
}
