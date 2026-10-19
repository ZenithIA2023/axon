"""
Descobertas: com thinking x sem thinking — a qualidade cai?

Mesma chamada de produção (prompt, schema e parser reais, Sonnet 4.6). O braço
"com" recebe teto folgado (16k) para medir QUALIDADE, não o corte por teto
(que era o bug). Duas usuárias fictícias com padrões diferentes.

Mede:
  - checagem automática: números de cada frase batem com o achado de origem;
    "dia seguinte" aparece só quando o achado é defasado;
  - juiz cego (Opus 5.5) pareado: A/B embaralhado, notas por critério.

Uso: python3 thinking_eval.py [--runs N]
"""

import json
import random
import re
import sys
from datetime import timedelta

from common import OUT, _add_spend, _anthropic, parse_json
from services.usage_service import claude_cost

import tasks_eval as T
from services import correlations_service as C, insights_service

MODEL = "claude-sonnet-4-6"
JUDGE = "claude-opus-5-5"


def _rafael_rows():
    """Noturno; exercício melhora o DIA SEGUINTE; café tarde piora o humor do dia
    seguinte; sábado é dia livre; sextas com reunião longa rendem menos."""
    rnd = random.Random(99)
    logs, tasks = [], []
    labels = {"cafe_tarde": "Café à tarde", "reuniao_longa": "Reuniões longas", "cansado": "Cansado",
              "animado": "Animado", "celular_cama": "Celular na cama"}
    exerc_ontem = cafe_ontem = False
    for k in range(42, 0, -1):
        d = T.HOJE - timedelta(days=k)
        wd = d.weekday()
        sabado = wd == 5
        exerc = rnd.random() < 0.45
        cafe = rnd.random() < 0.35
        cel = rnd.random() < 0.4
        sono = round(7.0 + (-0.9 if cel else 0) + rnd.uniform(-0.5, 0.5), 1)
        prod = max(1, min(5, 3 + (1 if exerc_ontem else 0) + (-1 if wd == 4 else 0) + rnd.choice([0, 0, 1, -1])))
        humor = max(1, min(5, 4 + (-1 if cafe_ontem else 0) + (-1 if sono < 6.4 else 0) + rnd.choice([0, 0, -1])))
        logs.append({
            "date": str(d), "sleep_time": "01:30" if cel else "00:30", "wake_time": "08:30",
            "hours_slept": sono, "sleep_rating": 2 if sono < 6.4 else 4, "mood_rating": humor,
            "productivity_rating": 1 if sabado else prod, "exercised": exerc,
            "sleep_tags": [x for x, on in (("cafe_tarde", cafe), ("celular_cama", cel)) if on],
            "mood_tags": ["cansado"] if sono < 6.4 else (["animado"] if humor >= 4 else []),
            "productivity_tags": ["reuniao_longa"] if wd == 4 else [],
            "peak_periods": ["fim_tarde", "noite"], "is_day_off": sabado,
        })
        n = 0 if sabado else max(0, 3 + (2 if exerc_ontem else 0) - (1 if wd == 4 else 0) + rnd.choice([-1, 0, 1]))
        for j in range(n):
            tasks.append({"status": "done", "completed_at": f"{d}T{15 + j:02d}:00:00+00:00"})
        exerc_ontem, cafe_ontem = exerc, cafe
    return insights_service.aggregate_daily(logs, tasks, T.ZONE, labels)


FIXTURES = {
    "marina": C.find_correlations(T.ROWS),
    "rafael": C.find_correlations(_rafael_rows()),
}

ARMS = {
    "com_thinking": dict(max_tokens=16000, thinking={"type": "adaptive"}),
    "sem_thinking": dict(max_tokens=4096),
}


def gerar(findings, arm):
    m = _anthropic.messages.create(
        model=MODEL, system=C._WRITER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": C._findings_to_user_message(findings)}],
        output_config={"format": {"type": "json_schema", "schema": C._WRITER_OUTPUT_SCHEMA}},
        **ARMS[arm])
    u = m.usage
    cost = claude_cost(MODEL, u.input_tokens, u.output_tokens, 0, 0) or 0
    _add_spend("anthropic", cost)
    txt = "".join(b.text for b in m.content if b.type == "text")
    return C._parse_written_findings(txt), u.output_tokens, cost, m.stop_reason


_NUM = re.compile(r"\d+(?:[.,]\d+)?")


def checar(itens, findings):
    """Erros objetivos: número que não vem do achado, defasagem trocada, índice inválido."""
    erros = []
    for it in itens:
        i = it.get("source_index")
        if not isinstance(i, int) or not 0 <= i < len(findings):
            erros.append(f"índice inválido {i}")
            continue
        f = findings[i]
        validos = [abs(v) for v in (f["avg_with"], f["avg_without"], f["diff_abs"], f["diff_pct"]) if v is not None]
        texto = f'{it["title"]} {it["detail"]}'
        for s in _NUM.findall(texto):
            n = float(s.replace(",", "."))
            if n in (1, 2, 3, 4, 5) and "/5" in texto:  # escala citada
                continue
            if not any(abs(n - v) <= max(0.06, v * 0.02) or abs(n - round(v)) < 1e-9 for v in validos):
                erros.append(f"[{i}] número {s} não vem do achado {validos}")
        fala_seguinte = "seguinte" in texto.lower()
        if f["same_day"] and fala_seguinte:
            erros.append(f"[{i}] diz 'dia seguinte' mas o achado é do mesmo dia")
        if not f["same_day"] and not fala_seguinte:
            erros.append(f"[{i}] achado defasado sem dizer 'dia seguinte'")
    idx = [it.get("source_index") for it in itens]
    if len(idx) != len(set(idx)):
        erros.append("índice repetido")
    return erros


JUDGE_SYSTEM = """Você é um avaliador rigoroso e imparcial. O Axon (assistente de produtividade) recebeu \
uma lista de descobertas estatísticas JÁ CALCULADAS sobre um usuário e precisava (1) fazer a CURADORIA \
das mais úteis (no máximo 4, sem redundância nem obviedade, priorizando o acionável e o efeito no dia \
seguinte) e (2) ESCREVÊ-LAS em frases naturais, sem alterar números e sem inventar causa.

Você recebe as instruções originais, a lista de descobertas (com índice) e DUAS respostas, A e B. Dê \
nota inteira 1–10 a cada uma em cada critério, de forma independente:
- fidelidade: números e direção corretos vs. o achado de origem; nenhuma causa inventada; "dia \
seguinte" só quando o achado é defasado.
- curadoria: escolheu as descobertas mais valiosas para ESTA pessoa, sem redundância nem trivialidade.
- utilidade: a pessoa sai sabendo o que pode fazer diferente.
- escrita: português natural, tom de parceiro próximo, sem jargão estatístico.
Depois diga qual resposta é melhor no geral ("A", "B" ou "empate") e por quê em uma frase.

Responda APENAS com JSON: {"A": {"fidelidade": n, "curadoria": n, "utilidade": n, "escrita": n}, \
"B": {...}, "melhor": "A|B|empate", "motivo": "..."}"""


def julgar(findings, itens_x, itens_y, seed):
    trocar = random.Random(seed).random() < 0.5
    a, b = (itens_y, itens_x) if trocar else (itens_x, itens_y)
    lista = "\n".join(f"[{i}] {json.dumps(f, ensure_ascii=False)}" for i, f in enumerate(findings))
    user = (f"=== INSTRUÇÕES ORIGINAIS DO AXON ===\n{C._WRITER_SYSTEM_PROMPT}\n\n"
            f"=== DESCOBERTAS CALCULADAS ===\n{lista}\n\n"
            f"=== RESPOSTA A ===\n{json.dumps(a, ensure_ascii=False, indent=1)}\n\n"
            f"=== RESPOSTA B ===\n{json.dumps(b, ensure_ascii=False, indent=1)}")
    with _anthropic.messages.stream(model=JUDGE, max_tokens=16000, system=JUDGE_SYSTEM,
                                    messages=[{"role": "user", "content": user}]) as s:
        m = s.get_final_message()
    u = m.usage
    _add_spend("anthropic", claude_cost(JUDGE, u.input_tokens, u.output_tokens, 0, 0) or 0)
    p = parse_json("".join(x.text for x in m.content if x.type == "text")) or {}
    # Desfaz a troca: devolve sempre (x=com_thinking, y=sem_thinking).
    nx, ny = (p.get("B"), p.get("A")) if trocar else (p.get("A"), p.get("B"))
    melhor = p.get("melhor")
    if melhor in ("A", "B"):
        melhor = ("y" if melhor == "A" else "x") if trocar else ("x" if melhor == "A" else "y")
    return nx, ny, melhor, p.get("motivo")


def main():
    runs = int(sys.argv[sys.argv.index("--runs") + 1]) if "--runs" in sys.argv else 3
    outf = OUT / "thinking_descobertas.jsonl"
    for nome, findings in FIXTURES.items():
        print(f"\n##### {nome}: {len(findings)} achados", flush=True)
        for run in range(runs):
            res = {}
            for arm in ARMS:
                itens, out, cost, stop = gerar(findings, arm)
                erros = checar(itens, findings)
                res[arm] = dict(itens=itens, out=out, cost=cost, stop=stop, erros=erros)
                print(f"  {arm:13s} r{run} itens={len(itens)} out={out} ${cost:.4f} stop={stop} "
                      f"escolheu={[i['source_index'] for i in itens]} erros={erros}", flush=True)
            nx, ny, melhor, motivo = julgar(findings, res["com_thinking"]["itens"], res["sem_thinking"]["itens"],
                                            f"{nome}{run}")
            print(f"  juiz: com={nx} sem={ny} melhor={ {'x': 'COM', 'y': 'SEM'}.get(melhor, melhor)} | {motivo}",
                  flush=True)
            with outf.open("a") as f:
                f.write(json.dumps(dict(fixture=nome, run=run, res=res, juiz_com=nx, juiz_sem=ny, melhor=melhor,
                                        motivo=motivo), ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
