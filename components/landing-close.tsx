/** Close copy only. The end card is a label on the card. */
export function LandingClose() {
  return (
    <section className="px-6 py-16 text-center border-t border-border" aria-label="Close">
      <h2 className="max-w-xl mx-auto text-2xl md:text-3xl font-bold tracking-tight text-foreground text-wrap">
        Your agent. Your keys. A receipt when it's right or wrong.
      </h2>
      <p className="mt-8 font-mono text-sm tracking-widest text-muted" data-end-card>
        THERE IS NO TRY
      </p>
    </section>
  );
}
