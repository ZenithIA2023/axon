# Testes de modelos e preços

Registro de todos os testes feitos para escolher os modelos de IA do Axon e medir o custo de cada funcionalidade. Começou em 07/10/2026, como parte da análise de custos antes do lançamento, em três tópicos:

1. Custo atual por usuário e por funcionalidade.
2. Melhor modelo por funcionalidade, com um principal e uma reserva.
3. Limites de cada plano (tier).

A ideia é juntar tudo aqui e fazer a análise final no fim.

## Estrutura

```
scripts/      o código dos testes (Python)
resultados/   o que cada teste gravou: um teste por linha, em JSON (.jsonl)
  logs/       saída de terminal das rodadas longas
```

Os testes que não gravaram arquivo estão descritos no [registro](#registro-cronológico-dos-testes), com os números que saíram no terminal.

## Antes de rodar qualquer teste

- **A chave da Anthropic é a mesma de produção.** Se um teste zerar o saldo, chat, voz, insights e relatórios param para todos os usuários. Isso já aconteceu duas vezes (07/10 e 19/10). Confirme o saldo antes de rodar.
- **O orçamento de testes é curto.** Use os resultados que já existem sempre que possível. Rode teste novo só para validar uma mudança no caminho real, que custa centavos.
- **Use apenas dados fictícios.** Os testes usam duas pessoas inventadas, a "Marina" (matutina, domingos livres) e o "Rafael" (noturno, sábados livres). Nenhum dado de usuário real entra aqui.
- **Saiba o teto da OpenRouter.** O `common.py` para tudo se o gasto da OpenRouter passar de `EVAL_OR_BUDGET` (padrão US$ 2,50, somado em `resultados/spend.json`).
- **Como rodar:** de dentro de `scripts/`, com `python3 <script>.py`. O `backend/.env` precisa existir com `ANTHROPIC_API_KEY` e `OPENROUTER_API_KEY`.

## Gasto até agora

| | Anthropic | OpenRouter |
|---|---|---|
| Rodada 1 (`spend_r1_final.json`) | US$ 1,58 | US$ 0,62 |
| Acumulado, todas as rodadas (`spend.json`) | US$ 3,03 | US$ 0,98 |

Fora do contador:
- ~US$ 0,63 da OpenRouter da primeira versão da rodada 1, perdida num reinício do Codespace;
- os testes rápidos de caminho real, que passam pelo backend e entram na tabela `api_usage_events` (depois apagados).

> **Cuidado com o custo nas tabelas.** Nos testes, a mesma entrada se repete, e os provedores cobram 10 a 20 vezes menos pela parte da entrada que já está em cache. Por isso alguns custos aparecem bem abaixo do real. Em produção, cada usuário manda dados diferentes e quase nada é reaproveitado. Exemplo: o GPT-6.1 Sol marcou US$ 0,010 nos Insights em algumas repetições, mas o custo real sem cache é ~US$ 0,031. Para estimar produção, use a primeira repetição de cada caso ou recalcule pelos tokens.

---

## Registro cronológico dos testes

### 1. Rodada 1: 12 modelos (07/10/2026)

**Objetivo:** primeira peneira entre 12 modelos, em todas as funcionalidades de texto.

- **Scripts:** `agent_eval.py` (chat e voz), `tasks_eval.py` (redação e textos curtos), `judge.py` (juiz cego), `summarize.py` (tabelas).
- **Resultados:** `agent.jsonl`, `tasks.jsonl`, `judge.jsonl`, `logs/log_agent_*`, `logs/log_tasks_*`.
- **Método:**
  - uma execução por caso;
  - um executor falso de ferramentas, sem tocar no banco;
  - o juiz é o Claude Opus 5.5, que vê as respostas embaralhadas, identificadas só por letra, e dá nota de 1 a 10.

**Agente (chat e voz), 13 cenários.** Quase todos acertaram tudo, porque os cenários eram fáceis demais. Isso motivou a rodada 2.

| Modelo | Acerto | Nota | US$/msg | 1ª resposta |
|---|---|---|---|---|
| Gemini 3.8 Flash | 13/13 | 8,3 | 0,0109 | 2,1s |
| Sonnet 5.5 | 13/13 | 8,0 | 0,0122 | 1,5s |
| GLM 5.3 Flash | 13/13 | 7,7 | 0,0009 | 0,7s |
| Sonnet 4.6 (produção) | 13/13 | 7,3 | 0,0182 | 3,5s |
| Gemini 3.5 Lite | 13/13 | 7,3 | 0,0040 | 0,9s |
| GPT-6 Luna | 13/13 | 7,3 | 0,0004 | 2,2s |
| GPT-6.1 Sol | 12/13 | 7,3 | 0,0059 | 2,4s |
| Haiku 4.5 | 11/13 | 5,3 | 0,0056 | 1,2s |

O Qwen 3.8 Flash, o Mistral Large 4, o MiniMax M3 e o DeepSeek v4.1 também acertaram 13/13, mas com nota de 6 a 7.

**Redação (Insights, Descobertas, Relatório).**

| Modelo | Nota geral | Insights | Descobertas | Relatório | US$/caso |
|---|---|---|---|---|---|
| GPT-6.1 Sol | 8,0 | 9 | 7 | 8 | 0,0145 |
| DeepSeek v4.1 Flash | 8,0 | 9 | 8 | 7 | 0,0023 |
| GLM 5.3 Flash | 7,3 | 6 | 7 | 9 | 0,0008 |
| Sonnet 5.5 | 6,3 | 5 | 8 | 6 | 0,0171 |
| Sonnet 4.6 (produção) | 3,7 | 3 ✗ | 1 ✗ | 7 | 0,0443 |
| Haiku 4.5 | 3,3 | 2 | 3 | 5 | 0,0071 |

**Textos curtos (notificações e motivos de rotina).** Quase todos foram bem:
- GPT-6.1 Sol: 8,0
- Sonnet 5.5: 7,8
- Gemini 3.8 Flash: 7,8
- DeepSeek: 7,7
- GPT-6 Luna: 7,5, a US$ 0,00017 por chamada

**Descartados:**
- **Qwen 3.8 Flash:** o raciocínio consome todo o limite de tokens e a resposta sai vazia.
- **Mistral Large 4:** lento (~80s) e com JSON inválido.
- **MiniMax M3:** 11s ou mais por resposta.

**Bugs de produção encontrados nesta rodada:**
1. **Descobertas vazias:** o Sonnet 4.6 com thinking gastava o teto de 4.096 tokens pensando e não escrevia nada.
2. **Insights perdidos:** uma aspa sem escape no JSON fazia o parser descartar a resposta inteira.

Os dois foram corrigidos em 19/10 (testes 5 e 6).

### 2. Rodada 2: finalistas, sem provedores chineses (07/10/2026)

**Objetivo:** desempatar os finalistas com cenários difíceis e 3 repetições. Os provedores chineses (DeepSeek, GLM, Qwen, MiniMax) ficaram de fora por decisão do Bernardo.

- **Scripts:** `agent_r2.py`, `tasks_eval.py --runs 3 --out tasks_r2.jsonl`, `judge_r2.py`, `summarize_r2.py`.
- **Resultados:** `agent_r2.jsonl`, `tasks_r2.jsonl`, `judge_r2.jsonl`, `logs/log_r2_*`.

**Chat por texto (10 cenários × 3).**

| Modelo | Acerto | Nota | US$/msg | 1ª resposta | Falhas |
|---|---|---|---|---|---|
| Gemini 3.5 Lite | 30/30 | 7,0 | 0,0036 | 1,0s | — |
| Sonnet 5.5 | 27/30 | 7,0 | 0,0117 | 1,6s | H1 ×3 (cenário ambíguo) |
| Gemini 3.8 Flash | 30/30 | 6,7 | 0,0109 | 1,9s | — |
| GPT-6 Luna | 24/30 | 5,3 | 0,0004 | 1,7s | H11: criou tarefa sem pedir |

**Voz (6 cenários × 2).**

| Modelo | Acerto | Nota | US$/msg | 1ª resposta |
|---|---|---|---|---|
| Gemini 3.8 Flash | 12/12 | 9,0 | 0,0119 | 1,7s |
| Gemini 3.5 Lite | 12/12 | 8,5 | 0,0033 | 1,1s |
| GPT-6 Luna | 9/12 | 8,0 | 0,0005 | 1,8s |
| Sonnet 5.5 | 10/12 | 6,0 | 0,0131 | 1,7s |

**Redação (3 tarefas × 3), nota média e [mínima–máxima].** Os custos têm efeito de cache (ver o aviso acima).

| Modelo | Geral | Insights | Descobertas | Relatório | US$/caso |
|---|---|---|---|---|---|
| GPT-6.1 Sol | 8,4 | 9,3 [9–10] | 7,7 [7–8] | 8,3 [8–9] | 0,0082 |
| Sonnet 5.5 | 7,0 | 6,0 [4–7] | **8,0 [8–8]** | 7,0 [6–8] | 0,0167 |
| GPT-6 Luna | 6,6 | 5,7 | 6,7 | 7,3 | 0,0004 |
| Gemini 3.8 Flash | 6,1 | 5,3 | 6,7 | 6,3 | 0,0040 |
| Gemini 3.5 Lite | 5,8 | 5,3 | 5,7 | 6,3 | 0,0014 |

**Textos curtos (6 tarefas × 3).**

| Modelo | Acerto | Nota | US$/caso | Falhas |
|---|---|---|---|---|
| Gemini 3.8 Flash | 18/18 | 7,7 | 0,00122 | — |
| GPT-6 Luna | 18/18 | 7,5 | 0,00010 | — |
| Sonnet 5.5 | 16/18 | 7,3 | 0,00340 | análise de bloco ruim ×2 |
| Gemini 3.5 Lite | 15/18 | 6,2 | 0,00045 | JSON inválido (chave sem aspas) ×3 |

**Achados importantes:**
- **Horário que já passou:** só o Sonnet 5.5 percebeu que "hoje às 14h30" já tinha passado, num teste rodado às 20h44. Os outros agendaram no passado, e isso levou à trava do teste 3.
- **Campos vazios no GPT:** o GPT preenche campos opcionais com `""`, e o `agent_tools` não limpa strings vazias. É um risco quando o chat for para o GPT.

**Recomendação que saiu desta rodada:**
- **Chat e voz:** Gemini 3.5 Lite.
- **Redação:** GPT-6.1 Sol.
- **Textos curtos:** GPT-6 Luna.
- **Reservas:** o Sonnet 5.5 nos três casos, revisado no teste 12. A primeira versão sugeria o Gemini 3.8 Flash para os curtos, mas ele também passa pela OpenRouter.

### 3. Trava contra agendar no passado (07/10/2026)

**Objetivo:** ver como cada modelo reage quando o backend recusa criar uma tarefa num horário que já passou (`agent_tools._erro_horario_passado`).

- **Script:** `guard_eval.py`.
- **Resultados:** `guard.jsonl`, `logs/log_guard_*`.

**Resultado:**
- Os 5 modelos reagiram corretamente: avisaram o usuário e nenhum contornou a trava por conta própria com `confirmar_passado`.
- As 2 "falhas" do Gemini 3.8 Flash eram do avaliador automático, que procurava "passou" e não reconhecia "passaram".
- A trava também foi testada no banco real, com 7 casos, e os dados de teste foram apagados. Esse teste não gravou arquivo.

### 4. Quanto economiza trocar só para o Sonnet 5.5? (07/10/2026, sem gasto)

Estimativa a partir dos testes 1 e 2, num perfil hipotético de uso:

| Cenário | Custo por usuário por mês |
|---|---|
| Hoje (Sonnet 4.6) | ~US$ 5,20 |
| Só Sonnet 5.5 | ~US$ 3,60 (−30%) |
| Mix de provedores | ~US$ 1,20 |

Esses números herdam o efeito de cache do aviso acima e devem ser refeitos com os dados reais de `api_usage_events` depois do deploy.

### 5. Correção dos 2 bugs no caminho real (19/10/2026)

Rodado pelo backend, com o Sonnet 4.6 de produção. Não gravou arquivo.

| | Resultado | Custo |
|---|---|---|
| Insights com saída estruturada | 3/3 com 8 itens válidos; em cada um, 6 ou 7 itens tinham aspas no texto (o caso que antes quebrava) | — |
| Descobertas sem thinking | 3/3 com 4 itens, ~320 tokens de saída | US$ 0,014, contra 0,070 antes |

### 6. A correção vale para outros modelos? (19/10/2026)

**Objetivo:** confirmar que a saída estruturada e o desligamento do thinking não dependem do Sonnet 4.6.

- **Script:** `structured_eval.py`.
- **Resultados:** `structured.jsonl`.

**Resultado:**
- **Saída estruturada:** 28 de 28 respostas com JSON válido, em 6 modelos (Sonnet 4.6, Sonnet 5.5, GPT-6.1 Sol, GPT-6 Luna, Gemini 3.5 Lite e Gemini 3.8 Flash). O Gemini Lite, que tinha gerado JSON inválido na rodada 2, também passou.
- **Desligar o thinking não era portável.** O código só deixava de enviar o parâmetro, e no Sonnet 5.5 isso liga o raciocínio:

| Sonnet 5.5, Insights | Tokens de saída | Custo | Tempo |
|---|---|---|---|
| Thinking omitido | ~7.800 (teto de 8.192) | US$ 0,100 | 55s |
| `between_tools` | ~1.100 | US$ 0,033 | 10s |

Isso foi corrigido no `claude_service._thinking_kwargs`.

### 7. Descobertas e dia livre (19/10/2026)

**Problema:** uma descoberta disse "nos seus domingos a produtividade vai a zero" para uma usuária que descansa aos domingos.

**Correção:** os dias livres saíram das métricas de tarefas e de produtividade. O humor continua contando.

**Teste:** `backend/tests_correlations_day_off.py`, com 9 casos, mais o caminho real.

**Efeito colateral bom:** os zeros dos domingos distorciam as outras comparações. "Dormir depois das 23h" passou de 2,1 contra 4,1 tarefas para 2,5 contra 4,8, o número correto.

### 8. Relatório narrativo com e sem thinking (19/10/2026)

Sonnet 4.6, 3 repetições de cada.

- **Script:** `relatorio_thinking_eval.py`.
- **Resultados:** não gravou arquivo; os textos saíram no terminal.

| | Tokens de saída | Custo | Tempo |
|---|---|---|---|
| Com thinking | 1.300 a 1.730 | US$ 0,022 a 0,029 | 27 a 32s |
| Sem thinking | 145 a 159 | US$ 0,005 | ~5s |

**Avaliação:** a comparação foi feita a olho, sem juiz. O texto saiu equivalente, com os mesmos destaques e os números corretos.

### 9. Descobertas com e sem thinking (19/10/2026), interrompido

Sonnet 4.6, com os perfis Marina e Rafael e juiz cego comparando as duas respostas.

- **Script:** `thinking_eval.py`.
- **Resultados:** `thinking_descobertas.jsonl` (4 das 6 comparações planejadas).

**Interrupção:** o saldo da Anthropic acabou no meio do teste, e a produção ficou fora do ar até a recarga.

**Resultado parcial:** o juiz preferiu a versão com thinking nas 4 comparações.

| | Fidelidade | Custo |
|---|---|---|
| Com thinking | 7 a 9 | US$ 0,055 a 0,092 |
| Sem thinking | 3 a 5 | US$ 0,014 |

Sem thinking, o texto usou verbos de causa ("derruba", "reduz") e inventou explicações.

**Ressalvas:**
- Parte da penalidade foi indevida. A tag de sono do dia D se refere à noite anterior, então "no dia seguinte" está certo do ponto de vista do usuário.
- O teste perdeu o sentido porque o Sonnet 4.6 vai sair: a qualidade precisa ser medida no modelo de destino.

### 10. Privacidade na OpenRouter (19/10/2026)

**Teste:** uma chamada mínima por modelo, com `provider: {data_collection: "deny", zdr: true}` e saída estruturada. Não gravou arquivo.

**Resultado:**
- GPT-6.1 Sol, GPT-6 Luna e Gemini 3.5 Lite responderam normalmente.
- Com `zdr` (retenção zero), o GPT é servido pela Azure em vez da OpenAI, pelo mesmo preço.

### 11. Roteador de modelos no caminho real (19/10/2026)

O `backend/services/llm_service.py` roteia cada tarefa para um modelo principal, com uma reserva em outro provedor. Teste rodado pelo backend com o perfil Marina; não gravou arquivo.

| | Modelo | Tempo | Custo |
|---|---|---|---|
| Insights | GPT-6.1 Sol | 38,7s | US$ 0,031 |
| Descobertas | GPT-6.1 Sol | 10s | US$ 0,010 |
| Relatório | GPT-6.1 Sol | 4,7s | US$ 0,002 |
| Descobertas, com o principal forçado a falhar | Sonnet 5.5 (reserva) | 4,5s | US$ 0,012 |

**Observações:**
- O relatório do Sol saiu sem nenhum número, num texto vago.
- Os Insights respeitaram o dia livre.

### 12. Qual modelo nos Insights? (19/10/2026, sem gasto)

Análise feita com os dados dos testes 1, 2, 6 e 11, na prioridade definida pelo Bernardo: qualidade primeiro, depois custo, depois velocidade.

| | GPT-6.1 Sol | Sonnet 5.5 |
|---|---|---|
| Notas do juiz nos Insights | 9, 10, 9, 9 (as contagens conferem) | 5, 7, 7, 4 (erros de contagem) |
| Preço de tabela (OpenRouter) | US$ 2 / 10 por milhão | US$ 2 / 10 por milhão |
| Custo real sem cache | ~US$ 0,031 | ~US$ 0,034 (o tokenizer conta mais) |
| Tempo | 20 a 39s | ~10s |

**Decisão:** o GPT-6.1 Sol fica nos Insights.

---

## Decisões até agora

| Funcionalidade | Principal | Reserva | Estado |
|---|---|---|---|
| Insights, Descobertas, Relatório | GPT-6.1 Sol | Sonnet 5.5 | Implementado (`llm_service`, rota `redacao`) |
| Motivos da análise de rotina | GPT-6 Luna | Sonnet 5.5 | Próxima etapa |
| Chat e voz | Gemini 3.5 Lite | Sonnet 5.5 | Depois dos curtos |
| Notificações | — | — | Adiado; o Bernardo quer tratar com calma |

**Regras do roteamento:**
- A reserva fica sempre fora da OpenRouter, para não cair junto se ela cair.
- Antes do deploy, a política de privacidade precisa citar a OpenRouter e os provedores dos modelos.

## Lições e armadilhas

- **O efeito de cache distorce o custo dos testes** (ver o aviso no começo).
- **O juiz precisa ver o prompt de sistema completo.** Sem ele, pune como "inventado" o que estava no prompt.
- **O avaliador automático erra por detalhe de texto** ("passou" não reconhece "passaram"). Confira as falhas antes de concluir.
- **Thinking ligado com teto baixo produz resposta vazia.** Extração e redação vão sem thinking. No Sonnet 5.5, desligar é `between_tools`, não omitir o parâmetro.
- **Sem saída estruturada, os modelos quebram JSON**: aspas sem escape no Sonnet 4.6, chave sem aspas no Gemini Lite. Com saída estruturada, nenhum quebrou.
- **Qualidade se mede no modelo de destino.** Ajustar o modelo que vai sair desperdiça orçamento.

## Em aberto para a análise final

- **Descobertas:** na rodada 2, o Sonnet 5.5 teve nota 8,0 [8–8] contra 7,7 do Sol. Vale reavaliar quem fica nas Descobertas.
- **Relatório do Sol:** saiu sem números. É provável que um ajuste no prompt resolva.
- **Ambiguidade de "mesmo dia" e "dia seguinte" nas tags de sono:** o cálculo trata como mesmo dia algo que o usuário vive como noite anterior. Isso confunde o modelo e o juiz.
- **Custo real por usuário:** refazer com `api_usage_events` depois do deploy.
- **Tópico 3 (limites por plano):** depende dos planos, preços e margem, a definir pelo Bernardo.

## Como registrar um teste novo

1. Coloque o script em `scripts/`, importando `OUT` de `common.py` para gravar em `resultados/`.
2. Se o teste for rápido e não gravar arquivo, anote aqui mesmo assim: data, objetivo, modelo, números e decisão.
3. Acrescente uma seção no [registro cronológico](#registro-cronológico-dos-testes) e atualize [Decisões até agora](#decisões-até-agora) se algo mudar.
