interface LoadingScreenProps {
  loaded: number
  total: number
  error?: string | null
}

export default function LoadingScreen({ loaded, total, error }: LoadingScreenProps) {
  const pct = total === 0 ? 0 : Math.round((loaded / total) * 100)

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="w-80 flex flex-col items-center gap-4">
        <div className="text-2xl font-semibold">BrickCode</div>

        {error ? (
          <>
            <div className="text-red-400 text-sm text-center">
              No se pudieron cargar las piezas LEGO.
            </div>
            <div className="text-gray-500 text-xs text-center break-all">{error}</div>
          </>
        ) : (
          <>
            <div className="text-sm text-gray-400">Cargando piezas LEGO…</div>

            <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-yellow-400 transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="text-xs text-gray-500">
              {loaded} / {total} ({pct}%)
            </div>
          </>
        )}
      </div>
    </div>
  )
}
