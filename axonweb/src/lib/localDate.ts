// ===========================================================================
// DATA LOCAL DO APARELHO EM AAAA-MM-DD
// ===========================================================================
// Um jeito só de produzir a data local, para Planning, Foco e Dashboard
// concordarem sobre o que é "hoje".
//
// Montada à mão a partir de getFullYear/getMonth/getDate, e não com
// toLocaleDateString("sv-SE"): o resultado é o mesmo, mas aquele caminho
// depende dos dados de locale (ICU) do runtime para gerar um formato que
// sabemos montar sozinhos — e a tela inicial roda quase só em WebView de
// celular.
//
// NUNCA troque por toISOString().slice(0, 10): ele converte para UTC, e em
// UTC-3 depois das 21h devolve a data de AMANHÃ.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localTodayISO(): string {
  return toISODate(new Date());
}
