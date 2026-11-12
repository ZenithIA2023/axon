// ===========================================================================
// MARCA DO POP-UP AUTOMÁTICO DE REGISTRO DIÁRIO (1x por dia)
// ===========================================================================
// Guarda o dia em que o pop-up do Dashboard já apareceu, para não reabrir a
// cada volta à tela.
//
// É dado da CONTA, não do aparelho: morre com a sessão (resetAutoReviewMark,
// chamado pelo clearSessionItems do api.ts em todo logout, 401 com refresh
// inválido e expiração). Antes a chave sobrevivia ao logout, e a conta B que
// entrava no mesmo navegador no mesmo dia em que a conta A viu o pop-up
// simplesmente não recebia o pedido de registro. Mesma classe de bug do
// cronotipo herdado (ver ACCOUNT_CACHE_KEYS no api.ts).
//
// Mora em lib/ e não na página porque o api.ts precisa resetá-la, e lib não
// importa de pages/.

const AUTO_REVIEW_KEY = "axon_last_opened";

// Cópia em memória da marca, para quando o navegador recusa gravar no
// localStorage (modo privado, cota cheia, dados do site bloqueados). Sem ela o
// pop-up reapareceria a cada volta ao Dashboard. Sobrevive à navegação dentro
// do app, mas não a um reload — sem armazenamento, nada sobrevive. Por ser de
// módulo, também sobreviveria a um logout se o reset não a zerasse.
let shownInMemory: string | null = null;

// Dia em que o pop-up já apareceu. Falha de leitura conta como "ainda não
// mostrei hoje": se o getItem lançasse sem guarda, o efeito inteiro morria e
// o registro nunca era pedido.
export function autoReviewShownOn(): string | null {
  try {
    return localStorage.getItem(AUTO_REVIEW_KEY) ?? shownInMemory;
  } catch {
    return shownInMemory;
  }
}

// A marca é gravada só quando o pop-up REALMENTE abre — nunca ao decidir não
// mostrar nada. Gravar antes fazia com que abrir o app de manhã (quando ainda
// não há o que registrar) queimasse a única chance do dia: à noite o pop-up
// não vinha mais e o registro se perdia.
export function markAutoReviewShown(todayISO: string): void {
  shownInMemory = todayISO;
  try {
    localStorage.setItem(AUTO_REVIEW_KEY, todayISO);
  } catch {
    // Sem armazenamento: fica só a cópia em memória acima.
  }
}

// Fim de sessão: apaga a marca no armazenamento E em memória, para a próxima
// conta a entrar neste navegador receber o pop-up dela.
export function resetAutoReviewMark(): void {
  shownInMemory = null;
  try {
    localStorage.removeItem(AUTO_REVIEW_KEY);
  } catch {
    // Armazenamento inacessível: não há o que apagar lá.
  }
}
