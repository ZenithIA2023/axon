"""
Juiz cego: para cada caso, o Opus 5.5 recebe a entrada original e as saídas de
todos os modelos embaralhadas, identificadas só por letra, e dá nota 1-10 a
cada uma segundo critérios da tarefa. O mapeamento letra→modelo fica só no
arquivo de saída. Retomável: pula casos já julgados.

Uso: python3 judge.py
"""

import json
import random
import string

from common import OUT, _add_spend, _anthropic, parse_json
from services.usage_service import claude_cost

import agent_eval
import tasks_eval

JUDGE = "claude-opus-5-5"

CRIT = {
    "insights": "Fidelidade aos dados (nenhum padrão inventado, números coerentes com a tabela), relevância e utilidade prática dos padrões, clareza em português do Brasil, respeito ao formato e às regras do prompt de sistema.",
    "descobertas": "Fidelidade aos números recebidos (não pode alterar magnitude nem direção), boa curadoria (escolhe as descobertas mais úteis, evita redundância e trivialidade), frases naturais e acionáveis em português do Brasil, respeito às regras do prompt de sistema.",
    "relatorio": "Fidelidade aos números (não pode inventar nem alterar), narrativa útil que ajuda a pessoa a entender a semana, tom acolhedor sem bajulação, tamanho adequado, respeito às regras do prompt de sistema.",
    "notif_analise_bloco_ruim": "Decisão certa (sugerir tirar 'Estudar alemão' das 23h para um horário bom e livre), texto de notificação claro, curto, tom de parceiro próximo, coerente com a ação proposta.",
    "notif_analise_tudo_feito": "Decisão sensata (celebrar o dia concluído ou não notificar; nunca sugerir melhoria), texto curto, natural e não genérico.",
    "notif_reescrita_amanha": "Cita o horário exato, deixa claro que é para amanhã, no máximo 2 frases, tom de parceiro próximo, português natural.",
    "notif_reescrita_compactacao": "Cita o horário exato, diz que o dia termina mais cedo (e a que horas), no máximo 2 frases, tom de parceiro próximo.",
    "notif_alteracao": "Explica de forma clara e amigável o que mudou (de 21:30 para 08:00) e por quê, em 2 frases.",
    "rotina_motivos": "Cada motivo com no máximo 8 palavras, coerente com o tipo de movimento, tom de parceiro próximo, sem inventar horários.",
    "S2": "Resposta ao usuário que perguntou o que tem para hoje: lista correta e completa das 3 tarefas com horários, clara e concisa, tom de assistente pessoal.",
    "S9": "Resposta a 'Tô me sentindo meio cansada hoje, alguma dica pra render melhor?': empática, dicas concretas e coerentes com o cronotipo matutino, concisa, sem sermão.",
    "S10": "Usuário pediu call às 14h30 e há conflito com 'Reunião com o Pedro' (14h-15h): a resposta avisa o conflito com clareza e pergunta se mantém ou troca de horário, sem criar sozinho.",
}

SYSTEM = """Você é um avaliador rigoroso e imparcial de respostas de um assistente de produtividade em português do Brasil (o Axon). Você recebe a ENTRADA original (dados e instruções que o modelo recebeu) e várias RESPOSTAS candidatas, identificadas só por letras. Avalie cada candidata de forma independente, segundo os CRITÉRIOS, com nota inteira de 1 a 10 (10 = impecável, 7 = boa com pequenos defeitos, 5 = aceitável com problemas, 3 = ruim, 1 = inútil ou errada). Penalize forte qualquer número inventado ou alterado. Não premie tamanho por si só.

Responda APENAS com JSON válido: {"avaliacoes": [{"letra": "A", "nota": 8, "comentario": "uma frase objetiva"}, ...]}"""


def _judge_case(case: str, entrada: str, outputs: dict[str, str]) -> dict:
    models = list(outputs)
    random.Random(case).shuffle(models)
    letras = dict(zip(string.ascii_uppercase, models))
    blocos = "\n\n".join(f"### Candidata {l}\n{outputs[m] or '(resposta vazia)'}" for l, m in letras.items())
    user = (f"CRITÉRIOS: {CRIT[case]}\n\n=== ENTRADA ORIGINAL ===\n{entrada}\n\n"
            f"=== RESPOSTAS CANDIDATAS ===\n{blocos}")
    with _anthropic.messages.stream(model=JUDGE, max_tokens=16000, system=SYSTEM,
                                    messages=[{"role": "user", "content": user}]) as s:
        msg = s.get_final_message()
    u = msg.usage
    cost = claude_cost(JUDGE, u.input_tokens, u.output_tokens, u.cache_read_input_tokens or 0,
                       u.cache_creation_input_tokens or 0) or 0
    _add_spend("anthropic", cost)
    text = "".join(b.text for b in msg.content if b.type == "text")
    p = parse_json(text) or {}
    notas = {}
    for a in p.get("avaliacoes", []):
        m = letras.get(a.get("letra"))
        if m:
            notas[m] = {"nota": a.get("nota"), "comentario": a.get("comentario")}
    print(f"{case:30s} juiz ${cost:.3f} {len(notas)}/{len(models)} notas", flush=True)
    return {"case": case, "letras": letras, "notas": notas, "cost": cost}


def main():
    tasks = {}
    for l in (OUT / "tasks.jsonl").read_text().splitlines():
        r = json.loads(l)
        if not r.get("error"):
            tasks.setdefault(r["task"], {})[r["model"]] = r["text"]
    entradas = {name: ((system or "") + "\n\n" + user) for name, system, user, *_ in tasks_eval.TASKS}
    agent = {}
    for l in (OUT / "agent.jsonl").read_text().splitlines():
        r = json.loads(l)
        if r["scenario"] in ("S2", "S9", "S10") and r.get("run", 0) == 0 and not r.get("error"):
            agent.setdefault(r["scenario"], {})[r["model"]] = r["text"]
    msgs = {sid: msg for sid, msg, _ in agent_eval.SCENARIOS}
    # O juiz precisa ver o que o modelo viu: prompt de sistema completo (traz
    # data/hora atual, cronotipo e janelas de energia) e o retorno das
    # ferramentas (traz prioridade e data). A 1ª versão passava só um resumo, e
    # o juiz puniu como "inventado" o que estava no prompt.
    from services import prompts
    sys_txt = "\n\n".join(b["text"] for b in prompts.build_agent_prompt(
        agent_eval.PERFIL, [m["content"] for m in agent_eval.ESTADO["memories"]]))
    ctx_agent = ("PROMPT DE SISTEMA QUE O MODELO RECEBEU (a hora atual variou poucos minutos entre as "
                 "candidatas):\n" + sys_txt + "\n\nRETORNO DA FERRAMENTA listar_tarefas (se chamada):\n"
                 + json.dumps(agent_eval.ESTADO["tasks"], ensure_ascii=False) + "\n\nMensagem da usuária: ")
    jf = OUT / "judge.jsonl"
    done = {json.loads(l)["case"] for l in jf.read_text().splitlines()} if jf.exists() else set()
    for case, outs in list(tasks.items()) + list(agent.items()):
        if case in done:
            continue
        entrada = entradas.get(case) or (ctx_agent + msgs[case])
        res = _judge_case(case, entrada, outs)
        with jf.open("a") as f:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
