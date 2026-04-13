export default function Noticias() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>Noticias</h1>
      <div className="themed-card rounded-2xl p-8 border text-center">
        <div className="text-5xl mb-4">📰</div>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Próximamente</h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Acá vas a poder ver novedades del mundo del padel: resultados de torneos,
          anuncios de clubes, eventos especiales y más.
        </p>
        <div className="flex flex-col gap-2 max-w-sm mx-auto">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
            <span className="text-lg">🏆</span>
            <span className="text-xs text-left" style={{ color: "var(--text-secondary)" }}>Resultados de torneos en tiempo real</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
            <span className="text-lg">📢</span>
            <span className="text-xs text-left" style={{ color: "var(--text-secondary)" }}>Anuncios y promociones de clubes</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
            <span className="text-lg">🎾</span>
            <span className="text-xs text-left" style={{ color: "var(--text-secondary)" }}>Novedades de la comunidad padel</span>
          </div>
        </div>
      </div>
    </div>
  );
}
