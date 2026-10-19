"""
Juiz da rodada 2. Reaproveita _judge_case/CRIT da rodada 1.

- Redação: julga CADA repetição (insights#r0, #r1, #r2) — é onde a qualidade
  mais varia entre execuções.
- Curtos: só a repetição 0 (na rodada 1 todos os finalistas foram bem).
- Agente: textos de H6, H8, H11 e duas respostas por voz (repetição 0), com o
  prompt de sistema completo que o modelo viu.
"""

import json

import agent_eval as A
import agent_r2
import judge as J
import tasks_eval
from common import OUT
from services import prompts

J.CRIT.update({
    "H6": "Usuária pergunta quantas aulas de alemão faltam (objetivo: 40 de 257 feitas): resposta correta (217), clara, curta, com algum incentivo sem exagero.",
    "H8": "Pergunta hipotética ('se eu marcar academia às 6h amanhã, atrapalha meu sono?'): responde com base no cronotipo matutino e no sono, sem criar nada, concisa e útil.",
    "H11": "Usuária pergunta o que tem amanhã e se dá para encaixar uma corrida de 40 min de manhã (amanhã: Revisar contrato 10h-11h): lista correta, avalia o encaixe com bom senso e PERGUNTA antes de criar — criar sem pedir é erro.",
    "VOZ_H3": "Resposta FALADA (será lida em voz alta) depois de mover a academia de hoje para amanhã 18h: curta, natural de ouvir, sem markdown, listas ou emojis, confirma o que foi feito.",
    "VOZ_H6": "Resposta FALADA (será lida em voz alta) à pergunta de quantas aulas de alemão faltam (217): curta, natural de ouvir, sem markdown, listas ou emojis.",
})


def _ctx(voice: bool) -> str:
    sys_txt = "\n\n".join(b["text"] for b in prompts.build_agent_prompt(
        A.PERFIL, [m["content"] for m in A.ESTADO["memories"]], voice=voice))
    return ("PROMPT DE SISTEMA QUE O MODELO RECEBEU:\n" + sys_txt
            + "\n\nDADOS QUE AS FERRAMENTAS DEVOLVEM (se chamadas):\ntarefas: "
            + json.dumps(A.ESTADO["tasks"], ensure_ascii=False)
            + "\nobjetivos: " + json.dumps(A.ESTADO["objectives"], ensure_ascii=False)
            + "\n\nMensagem da usuária: ")


def main():
    casos = {}  # case -> (entrada, {modelo: texto})
    entradas = {name: ((system or "") + "\n\n" + user) for name, system, user, *_ in tasks_eval.TASKS}
    for l in (OUT / "tasks_r2.jsonl").read_text().splitlines():
        r = json.loads(l)
        if r.get("error"):
            continue
        redacao = r["task"] in ("insights", "descobertas", "relatorio")
        if not redacao and r["run"] != 0:
            continue
        case = f"{r['task']}#r{r['run']}" if redacao else r["task"]
        casos.setdefault(case, (entradas[r["task"]], {}))[1][r["model"]] = r["text"]

    msgs = {sid: msg for sid, msg, _ in A.SCENARIOS + agent_r2.SCENARIOS}
    for l in (OUT / "agent_r2.jsonl").read_text().splitlines():
        r = json.loads(l)
        if r.get("error") or r["run"] != 0:
            continue
        if not r["voice"] and r["scenario"] in ("H6", "H8", "H11"):
            case = r["scenario"]
        elif r["voice"] and r["scenario"] in ("H3", "H6"):
            case = f"VOZ_{r['scenario']}"
        else:
            continue
        casos.setdefault(case, (_ctx(r["voice"]) + str(msgs[r["scenario"]]), {}))[1][r["model"]] = r["text"]

    jf = OUT / "judge_r2.jsonl"
    done = {json.loads(l)["case"] for l in jf.read_text().splitlines()} if jf.exists() else set()
    for case, (entrada, outs) in sorted(casos.items()):
        if case in done:
            continue
        crit_key = case.split("#")[0]
        J.CRIT.setdefault(case, J.CRIT[crit_key])
        res = J._judge_case(case, entrada, outs)
        with jf.open("a") as f:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
