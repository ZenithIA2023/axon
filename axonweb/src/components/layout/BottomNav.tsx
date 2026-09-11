import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type FormEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AudioLines,
  BarChart3,
  CalendarDays,
  Home,
  Plus,
  Send,
  User,
} from "lucide-react";

import { isNative } from "../../lib/nativeAuth";
// Versão reduzida (192px) do rosto: a barra aparece em todas as telas do app,
// e o original de 1080px pesa 687KB para ser exibido a 44px.
import axonHead from "../../assets/axon/axon-head-happy-sm.png";

// ===========================================================================
// TIPOS DO COMPONENTE
// ===========================================================================

type TabItem = {
  label: string;
  icon: ElementType;
  path: string;
  // Rotas extras que também deixam esta aba acesa (ex.: /rotinas cai em
  // Planejamento, que é a mesma tela com outra aba interna).
  alsoActiveOn?: string[];
};

// ===========================================================================
// ABAS DA BARRA
// ===========================================================================
// Quatro destinos onde o usuário FICA. Chat e voz não entram aqui: são ações,
// e moram na bolinha do Axon.
const tabs: TabItem[] = [
  {
    label: "Início",
    icon: Home,
    path: "/dashboard",
  },
  {
    label: "Planejar",
    icon: CalendarDays,
    path: "/planning",
    alsoActiveOn: ["/planejamento", "/rotinas", "/objetivos", "/rotina"],
  },
  {
    label: "Insights",
    icon: BarChart3,
    path: "/insights",
  },
  {
    label: "Perfil",
    icon: User,
    path: "/profile",
    alsoActiveOn: ["/settings"],
  },
];

// Telas de imersão: têm composer ou orb no rodapé e ocupam a altura toda. A
// barra some nelas para não brigar por espaço nem por atenção.
const hiddenOn = ["/voz", "/focus"];

// Rotas do app interno. Fora desta lista (landing, login, onboarding) a barra
// não aparece: navegar entre abas ali não faz sentido, e a lista explícita
// evita que uma rota nova de fluxo linear ganhe a barra por acidente.
const appRoutes = [
  "/dashboard",
  "/chat",
  "/planning",
  "/planejamento",
  "/insights",
  "/rotinas",
  "/rotina",
  "/objetivos",
  "/profile",
  "/settings",
  "/relatorio",
  "/voz",
  "/focus",
];

// Quanto tempo o dedo precisa ficar na bolinha para pular o leque e ir direto
// para a voz. Curto o bastante para não parecer travado, longo o bastante para
// não disparar num toque normal.
const HOLD_MS = 400;

// ===========================================================================
// BARRA DE NAVEGAÇÃO INFERIOR (MOBILE)
// ===========================================================================
// Substitui a Sidebar no app instalado. A web continua na Sidebar: numa tela
// grande a barra de baixo desperdiça a largura disponível.

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  // ---------------------------------------------------------------------------
  // Estado interno
  // ---------------------------------------------------------------------------
  // Texto digitado no composer, quando a barra está em modo chat.
  const [message, setMessage] = useState("");
  // O teclado do Android encolhe a viewport em vez de flutuar por cima. No
  // modo composer ele NÃO esconde a barra: é justamente quando ela é usada.
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const holdTimer = useRef<number | null>(null);
  const didHold = useRef(false);
  // Aba em que o usuário estava antes de entrar no chat. Guarda a aba inteira
  // (não só a rota) porque o botão de volta mostra o ÍCONE dela — é assim que
  // o usuário reconhece para onde está voltando.
  const [returnTab, setReturnTab] = useState<TabItem>(tabs[0]);

  const pathname = location.pathname;

  // ---------------------------------------------------------------------------
  // Visibilidade
  // ---------------------------------------------------------------------------
  // No chat a barra troca de forma: as abas dão lugar ao campo de mensagem.
  const isComposerMode =
    pathname === "/chat" || pathname.startsWith("/chat/");

  const isAppRoute = appRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const isHidden =
    !isAppRoute ||
    hiddenOn.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    ) ||
    // No modo composer o teclado é esperado: esconder a barra tiraria da tela
    // justamente o campo que o usuário acabou de tocar.
    (isKeyboardOpen && !isComposerMode);

  // Guarda de onde o usuário veio, para o botão da esquerda saber voltar. Só
  // rotas de aba entram: voltar do chat para o próprio chat não faria sentido.
  useEffect(() => {
    if (isComposerMode) return;

    const current = tabs.find(
      (tab) =>
        pathname === tab.path ||
        pathname.startsWith(`${tab.path}/`) ||
        (tab.alsoActiveOn ?? []).some(
          (route) => pathname === route || pathname.startsWith(`${route}/`),
        ),
    );

    if (current) {
      setReturnTab(current);
    }
  }, [pathname, isComposerMode]);

  // Sair do chat limpa o rascunho: ele pertence àquela visita.
  useEffect(() => {
    if (!isComposerMode) {
      setMessage("");
    }
  }, [isComposerMode]);

  // ---------------------------------------------------------------------------
  // Teclado do Android
  // ---------------------------------------------------------------------------
  // A altura da visualViewport cai quando o teclado abre. É o sinal mais
  // confiável aqui porque não depende do plugin de teclado estar instalado.
  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) return;

    // Guarda a altura com o teclado fechado para comparar depois. Rotacionar o
    // aparelho atualiza esta referência junto.
    let baseHeight = viewport.height;

    function handleResize() {
      if (!viewport) return;

      const shrank = baseHeight - viewport.height;

      // 160px é maior que qualquer barra de sistema que apareça/suma sozinha,
      // e menor que qualquer teclado.
      if (shrank > 160) {
        setIsKeyboardOpen(true);
      } else {
        setIsKeyboardOpen(false);
        baseHeight = Math.max(baseHeight, viewport.height);
      }
    }

    viewport.addEventListener("resize", handleResize);

    return () => viewport.removeEventListener("resize", handleResize);
  }, []);

  // ---------------------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------------------
  function isTabActive(tab: TabItem) {
    if (pathname === tab.path || pathname.startsWith(`${tab.path}/`)) {
      return true;
    }

    return (tab.alsoActiveOn ?? []).some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  }

  function goToTab(tab: TabItem) {
    // Tocar na aba onde já se está rola até o topo em vez de renavegar.
    if (isTabActive(tab) && pathname === tab.path) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    navigate(tab.path);
  }

  // Volta do chat para a última aba visitada.
  function leaveComposer() {
    navigate(returnTab.path);
  }

  // Entrega a mensagem para a tela de chat, que cuida de criar a conversa e
  // enviar. A barra só transporta o texto: manter a lógica de envio aqui
  // duplicaria o que ChatConversation já faz.
  function handleSend(event: FormEvent) {
    event.preventDefault();

    const text = message.trim();

    if (!text) return;

    setMessage("");
    navigate("/chat", { state: { draft: text, from: returnTab.path } });
  }

  // ---------------------------------------------------------------------------
  // Gestos da bolinha
  // ---------------------------------------------------------------------------
  function startHold() {
    didHold.current = false;

    holdTimer.current = window.setTimeout(() => {
      didHold.current = true;
      navigate("/voz");
    }, HOLD_MS);
  }

  function cancelHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  // Segurar já navegou; o clique que vem depois do dedo sair precisa ser
  // ignorado, senão abriria o leque por cima da tela de voz.
  function handleOrbClick() {
    if (didHold.current) {
      didHold.current = false;
      return;
    }

    navigate("/chat");
  }

  // Limpa o timer se o componente sair enquanto o dedo ainda está na bolinha.
  useEffect(() => cancelHold, []);

  // Largura do trilho, medida do próprio <nav>. Precisa ser em PIXELS: um
  // `calc(100% - ...)` seria resolvido contra a largura do elemento que está
  // animando, realimentando o valor — a caixa inflava para milhares de pixels
  // antes de encolher. É a origem do "estica tudo e só então troca".
  const [railWidth, setRailWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Callback ref em vez de useEffect com []: a barra desmonta nas telas onde
  // fica escondida, então um efeito de montagem única mediria `null` na
  // primeira vez e nunca mais rodaria — o trilho ficava com largura 0 e só a
  // bolinha aparecia. O callback dispara toda vez que o nó entra ou sai.
  const railRef = useCallback((rail: HTMLElement | null) => {
    observerRef.current?.disconnect();

    if (!rail) {
      observerRef.current = null;
      return;
    }

    const measure = () => {
      // O padding lateral do nav (px-3 = 0.75rem de cada lado) não faz parte
      // do trilho onde as caixas vivem.
      const styles = window.getComputedStyle(rail);
      const inner =
        rail.clientWidth -
        parseFloat(styles.paddingLeft) -
        parseFloat(styles.paddingRight);

      // Largura 0 acontece enquanto o nó ainda não foi disposto; guardá-la
      // travaria a barra fechada.
      if (inner > 0) {
        setRailWidth(inner);
      }
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    observerRef.current = observer;
  }, []);

  // Solta o observer quando o componente sai de vez.
  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  if (isHidden) {
    return null;
  }

  const ReturnIcon = returnTab.icon;

  // ---------------------------------------------------------------------------
  // Geometria da transformação
  // ---------------------------------------------------------------------------
  // As duas caixas trocam de largura ao mesmo tempo, animando PIXELS medidos do
  // trilho (ver railWidth acima). Quatro armadilhas que isto evita:
  //
  // 1. `layout` do framer-motion anima caixas por ESCALA, e escala estica o
  //    conteúdo junto — era o que deformava ícones, texto e o rosto do Axon.
  // 2. `width: "auto"` não é interpolável: o motor não sabe animar até um valor
  //    que só existe depois do layout, então saltava de um estado ao outro.
  // 3. Animar `flexGrow` nas duas caixas faz uma esperar a outra ceder espaço,
  //    o que produzia aquele "estica tudo, depois troca".
  // 4. `calc(100% - ...)` é resolvido contra a largura do PRÓPRIO elemento
  //    enquanto ele anima, realimentando o valor: a caixa inflava a milhares de
  //    pixels antes de encolher.
  //
  // Com pixels explícitos nos dois lados, o encolher de um e o crescer do outro
  // acontecem no MESMO quadro — a soma das larguras nunca muda.

  // Sombras em camadas: contato curto, corpo médio e um halo amplo. A terceira
  // camada é o que muda entre os dois estados — roxa sob a bolinha, preta sob
  // as superfícies escuras.
  const DARK_SHADOW =
    "0 2px 8px rgba(0,0,0,0.45), 0 12px 28px rgba(0,0,0,0.6), 0 24px 60px rgba(0,0,0,0.75)";
  const ORB_SHADOW =
    "0 2px 8px rgba(0,0,0,0.45), 0 12px 28px rgba(0,0,0,0.6), 0 20px 48px rgba(123,44,191,0.35)";

  // 3.75rem do círculo e 0.625rem (gap-2.5) de respiro, em pixels.
  const rootFontSize = 16;
  const ORB_PX = 3.75 * rootFontSize;
  const GAP_PX = 0.625 * rootFontSize;
  // Antes da primeira medição não há largura: usar 0 faria a barra piscar
  // fechada, então o lado largo só é calculado quando o trilho é conhecido.
  // Antes da primeira medição não há largura em pixels. Renderizar 0 deixaria
  // a barra como só a bolinha (o lado largo fechado), que foi exatamente o
  // sintoma da barra "pela metade": o CSS abaixo cai para flex-1 enquanto
  // `isMeasured` é falso, então o primeiro quadro já sai certo.
  const isMeasured = railWidth > 0;
  const widePx = isMeasured ? railWidth - ORB_PX - GAP_PX : 0;

  const leftWidth = isComposerMode ? ORB_PX : widePx;
  const rightWidth = isComposerMode ? widePx : ORB_PX;

  // Uma curva só para as duas caixas: tempos diferentes abririam ou fechariam
  // o espaço entre elas no meio do caminho.
  const morph = {
    type: "spring" as const,
    stiffness: 420,
    damping: 38,
    mass: 0.9,
  };

  // O conteúdo que sai desaparece antes de a caixa fechar; o que entra só
  // aparece quando ela já está quase aberta.
  const fadeOut = { duration: 0.12, ease: "easeOut" as const };
  const fadeIn = { duration: 0.18, delay: 0.12, ease: "easeOut" as const };

  return (
    <motion.nav
      ref={railRef}
      data-bottom-nav
      initial={{ y: "130%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="fixed inset-x-0 bottom-0 z-[90] flex items-end gap-2.5 px-3 pb-3"
    >
      {/* -----------------------------------------------------------------
          ESQUERDA — abas que, no chat, comprimem até virar um único círculo
          com o ícone da página de onde o usuário veio.
          ----------------------------------------------------------------- */}
      <motion.div
        animate={isMeasured ? { width: leftWidth } : undefined}
        transition={morph}
        style={isMeasured ? { width: leftWidth } : undefined}
        initial={false}
        className={`relative h-[3.75rem] shrink-0 overflow-hidden rounded-[1.875rem] bg-[#1F1E2A] shadow-[0_2px_8px_rgba(0,0,0,0.45),0_12px_28px_rgba(0,0,0,0.6),0_24px_60px_rgba(0,0,0,0.75)] ${
          isMeasured ? "" : "flex-1"
        }`}
      >
        {/* As abas são ancoradas à ESQUERDA com largura fixa de 100% da caixa
            larga. Sem isso, `inset-0` faria elas encolherem junto com a caixa e
            o conteúdo seria espremido — a máscara é o `overflow-hidden` do pai,
            que vai cobrindo as abas conforme a caixa fecha. */}
        <motion.div
          animate={{ opacity: isComposerMode ? 0 : 1 }}
          transition={isComposerMode ? fadeOut : fadeIn}
          style={{
            width: isMeasured ? widePx : undefined,
            right: isMeasured ? undefined : 0,
            pointerEvents: isComposerMode ? "none" : "auto",
          }}
          className="absolute inset-y-0 left-0 flex items-center gap-0.5 p-1.5"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab);

            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => goToTab(tab)}
                aria-current={isActive ? "page" : undefined}
                aria-hidden={isComposerMode}
                tabIndex={isComposerMode ? -1 : 0}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[1.45rem] px-1 pb-1.5 pt-2 transition-colors active:scale-[0.94] ${
                  isActive ? "text-[#c084fc]" : "text-white/55"
                }`}
              >
                {/* Fundo da aba ativa pintado em CADA aba, revelado por
                    opacidade. Um só elemento com `layoutId` voava de uma aba à
                    outra atravessando as do meio — a "bola roxa" que cruzava a
                    barra. */}
                <span
                  aria-hidden
                  className={`absolute inset-0 -z-10 rounded-[1.45rem] bg-white/[0.07] transition-opacity duration-200 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />

                <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" />

                <span className="max-w-full truncate text-[0.6rem] font-semibold leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* Botão de volta: largura do círculo e ancorado à direita, que é onde
            a caixa termina nos dois estados — assim ele nasce já no lugar
            final, sem deslizar enquanto a caixa fecha. */}
        <motion.button
          type="button"
          onClick={leaveComposer}
          aria-label={`Voltar para ${returnTab.label}`}
          aria-hidden={!isComposerMode}
          tabIndex={isComposerMode ? 0 : -1}
          animate={{ opacity: isComposerMode ? 1 : 0 }}
          transition={isComposerMode ? fadeIn : fadeOut}
          style={{
            width: ORB_PX,
            pointerEvents: isComposerMode ? "auto" : "none",
          }}
          className="absolute inset-y-0 right-0 flex items-center justify-center text-white/70"
        >
          <ReturnIcon className="h-5 w-5 shrink-0" />
        </motion.button>
      </motion.div>

      {/* -----------------------------------------------------------------
          DIREITA — bolinha do Axon que, no chat, expande e vira o campo de
          mensagem.
          ----------------------------------------------------------------- */}
      <motion.div
        animate={
          isMeasured
            ? {
                width: rightWidth,
                backgroundColor: isComposerMode ? "#1F1E2A" : "#7c34b8",
                // A sombra acompanha o que a caixa É naquele momento: halo roxo
                // enquanto ela é a bolinha do Axon, sombra preta quando vira o
                // campo de texto. Deixá-la fixa no className projetava um brilho
                // roxo atrás de um campo escuro, sem nada na tela que o
                // justificasse.
                boxShadow: isComposerMode ? DARK_SHADOW : ORB_SHADOW,
              }
            : undefined
        }
        transition={morph}
        initial={false}
        style={
          isMeasured
            ? {
                width: rightWidth,
                boxShadow: isComposerMode ? DARK_SHADOW : ORB_SHADOW,
              }
            : { width: ORB_PX, boxShadow: ORB_SHADOW }
        }
        className="relative h-[3.75rem] shrink-0 overflow-hidden rounded-[1.875rem]"
      >
        {/* Degradê da bolinha: sai junto com o rosto para não arrastar roxo
            para dentro do campo de mensagem. */}
        <motion.span
          aria-hidden
          animate={{ opacity: isComposerMode ? 0 : 1 }}
          transition={isComposerMode ? fadeOut : fadeIn}
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#a45ae0] to-[#6a26a8]"
        />

        {/* Composer ancorado à DIREITA: é a borda que não se move quando esta
            caixa cresce, então o campo não desliza enquanto abre. */}
        <motion.form
          onSubmit={handleSend}
          animate={{ opacity: isComposerMode ? 1 : 0 }}
          transition={isComposerMode ? fadeIn : fadeOut}
          style={{
            width: isMeasured ? widePx : undefined,
            right: isMeasured ? undefined : 0,
            pointerEvents: isComposerMode ? "auto" : "none",
          }}
          aria-hidden={!isComposerMode}
          className="absolute inset-y-0 right-0 flex items-center gap-1 px-2"
        >
          <button
            type="button"
            onClick={() => navigate("/chat")}
            aria-label="Nova conversa"
            tabIndex={isComposerMode ? 0 : -1}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/55 transition active:scale-[0.92]"
          >
            <Plus className="h-5 w-5" />
          </button>

          <input
            id="bottom-nav-composer"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mensagem AXON"
            tabIndex={isComposerMode ? 0 : -1}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />

          {/* Sem texto o botão oferece a voz; com texto, o envio. Mesmo padrão
              do composer que já existe dentro da conversa. */}
          {message.trim() ? (
            <button
              type="submit"
              aria-label="Enviar mensagem"
              tabIndex={isComposerMode ? 0 : -1}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-white transition active:scale-[0.92]"
            >
              <Send className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/voz")}
              aria-label="Conversar por voz"
              tabIndex={isComposerMode ? 0 : -1}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/70 transition active:scale-[0.92]"
            >
              <AudioLines className="h-5 w-5" />
            </button>
          )}
        </motion.form>

        {/* Rosto do Axon: largura do círculo, ancorado à direita pelo mesmo
            motivo do composer. */}
        <motion.button
          type="button"
          onClick={handleOrbClick}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Falar com o Axon"
          aria-hidden={isComposerMode}
          tabIndex={isComposerMode ? -1 : 0}
          animate={{ opacity: isComposerMode ? 0 : 1 }}
          transition={isComposerMode ? fadeOut : fadeIn}
          style={{
            width: ORB_PX,
            pointerEvents: isComposerMode ? "none" : "auto",
          }}
          className="absolute inset-y-0 right-0 flex items-center justify-center"
        >
          <img
            src={axonHead}
            alt=""
            className="h-11 w-11 min-w-[2.75rem] max-w-none select-none object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
            draggable={false}
          />
        </motion.button>
      </motion.div>
    </motion.nav>
  );
}

// ===========================================================================
// MONTAGEM CONDICIONAL
// ===========================================================================
// Esta barra é exclusiva do app instalado — iOS e Android. No navegador, em
// qualquer largura, a navegação continua sendo a Sidebar de cada página.
//
// `isNativePlatform()` é falso em todo browser, inclusive no celular e num PWA
// adicionado à tela inicial: só o app empacotado pelo Capacitor recebe a barra.

export function BottomNavGate() {
  if (!isNative()) {
    return null;
  }

  return <BottomNav />;
}
