"""
Compara a classificação do cronotipo com o questionário COMPLETO (17 perguntas
pontuadas) e com o questionário REDUZIDO do novo onboarding (sem P6, P11, P13,
P14, P15, P16 e P18), usando as respostas reais gravadas em `respostas`.

Contexto (nov/2026): o novo onboarding corta 7 perguntas quase repetidas. Isso
muda o cronotipo de quem refizer o teste, então antes de trocar é preciso saber
quantos usuários mudariam de perfil e para qual. A simulação com respostas
sintéticas indicou dois pontos fracos, que este script mede com dados reais:
  - Misto: a P18-G ("horários alternados") é o gatilho do Misto e sai do teste;
  - Bimodal: as opções noturnas que davam pontos ao segundo pico estavam
    justamente nas perguntas repetidas.

SOMENTE LEITURA. Não grava nada e imprime só agregados — nenhum user_id e
nenhuma resposta individual (dado pessoal não vai para o terminal).

Uso:
    python scripts/simular_pontuacao_reduzida.py
"""

import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from database import supabase                                 # noqa: E402
from services.chronotype import classificar_cronotipo         # noqa: E402

REMOVIDAS = {"P6", "P11", "P13", "P14", "P15", "P16", "P18"}
PAGINA = 1000


def carregar_respostas() -> dict[str, dict[str, str]]:
    """Todas as respostas, agrupadas por usuário (paginado: o PostgREST corta em 1000)."""
    por_usuario: dict[str, dict[str, str]] = defaultdict(dict)
    inicio = 0
    while True:
        lote = (
            supabase.table("respostas")
            .select("user_id,pergunta,alternativa")
            .range(inicio, inicio + PAGINA - 1)
            .execute()
            .data
        )
        for linha in lote:
            por_usuario[linha["user_id"]][linha["pergunta"]] = linha["alternativa"]
        if len(lote) < PAGINA:
            return por_usuario
        inicio += PAGINA


def main() -> None:
    por_usuario = carregar_respostas()

    # Só entra quem respondeu as 17 pontuadas: quem tem resposta faltando seria
    # classificado diferente nas duas versões por outro motivo.
    completos = {
        u: r for u, r in por_usuario.items()
        if len([p for p in r if p != "P9"]) >= 17
    }
    print(f"Usuários com respostas: {len(por_usuario)} | com as 17 pontuadas: {len(completos)}")
    if not completos:
        return

    dist_completo: Counter = Counter()
    dist_reduzido: Counter = Counter()
    trocas: Counter = Counter()
    bimodal_por_pontos = 0
    segundo_do_misto: Counter = Counter()
    margens_misto: list[int] = []

    for respostas in completos.values():
        completo, pontos = classificar_cronotipo(respostas)
        reduzido, _ = classificar_cronotipo(
            {p: a for p, a in respostas.items() if p not in REMOVIDAS}
        )
        dist_completo[completo] += 1
        dist_reduzido[reduzido] += 1
        if completo != reduzido:
            trocas[f"{completo} -> {reduzido}"] += 1

        # Bimodal que não marcou "dois picos" na P17 chegou ao perfil só pela soma.
        if completo == "Bimodal" and respostas.get("P17") != "E":
            bimodal_por_pontos += 1

        # Para a ideia do subcronotipo: entre os Mistos, quem ficou em segundo e
        # por quantos pontos.
        if completo == "Misto":
            outros = {c: v for c, v in pontos.items() if c != "Misto"}
            segundo = max(outros, key=lambda c: outros[c])
            segundo_do_misto[segundo] += 1
            margens_misto.append(pontos["Misto"] - outros[segundo])

    total = len(completos)
    iguais = total - sum(trocas.values())
    print(f"\nConcordância completo x reduzido: {iguais}/{total} = {iguais / total:.0%}")

    print("\nDistribuição (completo -> reduzido):")
    for tipo in ["Matutino", "Vespertino", "Noturno", "Misto", "Bimodal"]:
        print(f"  {tipo:<11} {dist_completo[tipo]:>4} ({dist_completo[tipo] / total:.0%})"
              f"  ->  {dist_reduzido[tipo]:>4} ({dist_reduzido[tipo] / total:.0%})")

    print("\nTrocas de perfil:")
    for troca, n in trocas.most_common():
        print(f"  {troca:<24} {n}")
    if not trocas:
        print("  nenhuma")

    print(f"\nP18 = G (gatilho do Misto que sai do teste): "
          f"{sum(1 for r in completos.values() if r.get('P18') == 'G')}")
    print(f"Bimodais SEM P17 = E (bimodais só pela soma): {bimodal_por_pontos}")

    if margens_misto:
        margens_misto.sort()
        print("\nMistos — quem ficou em segundo lugar:")
        for tipo, n in segundo_do_misto.most_common():
            print(f"  {tipo:<11} {n}")
        meio = margens_misto[len(margens_misto) // 2]
        print(f"Margem do Misto sobre o segundo: mín {margens_misto[0]}, "
              f"mediana {meio}, máx {margens_misto[-1]} pontos")


if __name__ == "__main__":
    main()
