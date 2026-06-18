export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "hsl(210 40% 98%)" }}>
      <div className="text-center max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <img src={import.meta.env.BASE_URL + "favicon.svg"} alt="TallyBill" className="w-9 h-9 rounded-xl" />
          <span className="text-xl font-bold text-foreground tracking-tight">TallyBill</span>
        </div>
        <div className="text-6xl mb-4">🧾</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Bill not found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Open the link from your friend or check the join code.
        </p>
        <a
          href="https://apps.apple.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-6 py-3 rounded-xl min-h-[44px] hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
          Get TallyBill
        </a>
      </div>
    </div>
  );
}
