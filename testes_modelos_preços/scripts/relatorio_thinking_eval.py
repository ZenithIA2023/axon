"""
Relatório narrativo: Sonnet 4.6 com thinking × sem thinking (19/10/2026).
Só imprime no terminal; o resultado está no README da pasta.
"""
import sys, time, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import _anthropic, _add_spend
from services.usage_service import claude_cost
import tasks_eval as T
from services import report_service as R
msg = R._period_summary_message(T.REPORT_DATA)
for label, kw in (("com thinking", {"thinking": {"type": "adaptive"}}), ("sem thinking", {})):
    for i in range(3):
        t0 = time.time()
        m = _anthropic.messages.create(model="claude-sonnet-4-6", max_tokens=4096, system=R._NARRATOR_SYSTEM_PROMPT,
                                       messages=[{"role": "user", "content": msg}], **kw)
        u = m.usage; c = claude_cost("claude-sonnet-4-6", u.input_tokens, u.output_tokens, 0, 0); _add_spend("anthropic", c)
        txt = "".join(b.text for b in m.content if b.type == "text")
        print(f"[{label} r{i}] out={u.output_tokens} ${c:.4f} {time.time()-t0:.1f}s\n{txt}\n", flush=True)
