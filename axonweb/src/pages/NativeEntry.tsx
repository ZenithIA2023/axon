import { Navigate } from "react-router-dom";

import * as api from "../lib/api";
import { homeRoute } from "../lib/onboarding";

/**
 * Rota raiz DENTRO do app.
 *
 * Na web, "/" é a landing page — uma peça de marketing que também renova a
 * sessão e redireciona quem já está logado. Isso funciona no navegador, mas no
 * app instalado significa que o usuário vê a tela de vendas piscar toda vez que
 * abre, enquanto uma chamada de rede decide para onde ir.
 *
 * Aqui a decisão é local e instantânea: existe sessão salva E recente? vai para
 * o app; senão, login. A renovação do token continua acontecendo, mas no
 * primeiro request autenticado (`request()` em lib/api.ts já trata o 401
 * renovando), fora do caminho de abertura.
 *
 * `hasFreshSession` (e não `isLoggedIn`) porque a janela de 7 dias de
 * inatividade vale também aqui: antes o app só checava se havia token, então a
 * sessão no celular nunca expirava — quem passasse um mês sem abrir entrava
 * direto. A contagem é por dispositivo, então usar o site não renova o prazo
 * deste aparelho.
 *
 * Logado mas sem cronotipo (fechou o app no meio do questionário) vai de volta
 * ao questionário — decisão também local, por um sinal que o servidor mantém
 * (ver `homeRoute` em lib/onboarding).
 */
export default function NativeEntry() {
  if (!api.hasFreshSession()) return <Navigate to="/login" replace />;

  const { to, state } = homeRoute();
  return <Navigate to={to} state={state} replace />;
}
