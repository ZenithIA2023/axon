"""
Caminho real da etapa 2 da troca de modelos (19/10/2026): motivos da análise de
rotina pelo llm_service, rota "curtos" (GPT-6 Luna, reserva Sonnet 5.5).

Chama a função de PRODUÇÃO (_write_reasons) com movimentos fictícios. Depois
força a falha do principal para ver a reserva assumir. Grava em
resultados/caminho_real.jsonl. As linhas de uso (api_usage_events, user_id
nulo) são apagadas no fim, conferindo o alcance antes.

Custo: centavos (Luna ~US$0,0002; Sonnet 5.5 ~US$0,003).
"""

import copy
import json
import time
from datetime import datetime, timedelta, timezone

from common import OUT

from database import supabase
from services import llm_service, routine_analysis_service as R

MOVES = [
    {"title": "Estudar alemão", "old_start": "23:00", "new_start": "08:00", "kind": "bad_block",
     "reason": "sai de um horário de baixa energia para pico"},
    {"title": "Responder e-mails", "old_start": "09:00", "new_start": "17:00", "kind": "complexity_match",
     "reason": "troca de lugar com 'Estudar alemão' para casar com sua energia"},
    {"title": "Revisar relatório", "old_start": "15:30", "new_start": "14:00", "kind": "compaction",
     "reason": "fecha um vão e o dia termina antes"},
]


def rodar(rotulo):
    moves = copy.deepcopy(MOVES)
    t0 = time.time()
    R._write_reasons(None, moves, "Marina")
    rec = {"teste": "etapa2_curtos", "data": "2026-10-19", "caso": rotulo,
           "rota": llm_service._ROUTES["curtos"], "s": round(time.time() - t0, 1),
           "motivos": [m["reason"] for m in moves],
           "reescreveu": [m["reason"] != o["reason"] for m, o in zip(moves, MOVES)]}
    print(json.dumps(rec, ensure_ascii=False), flush=True)
    with (OUT / "caminho_real.jsonl").open("a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


inicio = datetime.now(timezone.utc).isoformat()
rodar("principal")
rodar("principal (repetição)")
llm_service._ROUTES["curtos"][0] = ("openrouter", "openai/modelo-que-nao-existe")
rodar("principal forçado a falhar → reserva")

# Limpeza: só as linhas sem usuário desta execução.
q = lambda t: t.is_("user_id", "null").gte("created_at", inicio).eq("feature", "rotina_motivos")
linhas = q(supabase.table("api_usage_events").select("id, provider, model, output_tokens, cost_usd")).execute().data
print("uso registrado:", linhas)
if 0 < len(linhas) <= 3:
    q(supabase.table("api_usage_events").delete()).execute()
    print(f"apagadas {len(linhas)} linhas de uso do teste")
