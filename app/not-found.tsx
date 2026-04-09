export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--lv-bg)] p-6 text-white">
      <div className="text-center">
        <h1 className="font-display text-3xl">Page Not Found</h1>
        <p className="mt-2 text-sm text-cyan-100/70">The route you requested does not exist.</p>
      </div>
    </main>
  )
}
