/**
 * Página do relatório (semanal ou mensal) em tela cheia — rota /relatorio/:id.
 *
 * Substitui a visualização em pop-up: as 3 seções do relatório não cabiam
 * confortavelmente num modal. A partir do Perfil (histórico) e do card do
 * Dashboard o usuário navega para cá, e o botão de voltar retorna para a tela
 * de origem.
 *
 * Não existe endpoint de relatório por id: o histórico (`getReportsHistory`)
 * já devolve todos os relatórios do usuário, então a página busca a lista e
 * seleciona pelo id da rota. Evita mexer no backend só por causa da navegação.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import * as api from "../lib/api";
import AppBackground from "../components/layout/AppBackground";
import PageHeader from "../components/layout/PageHeader";
import Sidebar from "../components/layout/Sidebar";
import { ReportFullView } from "../components/reports/ReportFullView";

export default function Report() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [report, setReport] = useState<api.PeriodReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    api
      .getReportsHistory()
      .then((reports) => {
        const found = reports.find((r) => r.id === id) ?? null;
        setReport(found);
        setError(found ? null : "Relatório não encontrado.");
      })
      .catch((e: Error) => {
        setError(e.message || "Não foi possível carregar o relatório.");
        setReport(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Voltar respeita o histórico do navegador; sem histórico (link direto ou
  // abertura no app), cai no Perfil, que é onde o acervo vive.
  function handleBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/profile");
  }

  const periodLabel =
    report?.period_type === "monthly" ? "Relatório mensal" : "Relatório semanal";

  return (
    <main className="relative min-h-screen overflow-hidden bg-app text-primary">
      <AppBackground />

      <div className="relative z-10 min-h-screen px-4 pb-6 pt-5">
        <PageHeader
          title="Relatório"
          subtitle={loading ? undefined : report ? periodLabel : undefined}
          leadingVariant="back"
          onBack={handleBack}
          onMenuClick={() => setIsSidebarOpen(true)}
        />

        <div className="mt-4">
          {loading ? (
            <div className="rounded-[1.7rem] border border-soft bg-surface-muted px-4 py-10 text-center">
              <p className="text-sm text-muted">Carregando relatório…</p>
            </div>
          ) : error || !report ? (
            <div className="rounded-[1.7rem] border border-dashed border-soft bg-surface-muted px-4 py-10 text-center">
              <p className="text-sm text-muted">
                {error ?? "Relatório não encontrado."}
              </p>
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl border border-soft bg-surface-elevated px-4 text-xs font-semibold text-secondary transition active:scale-[0.98]"
              >
                Ver histórico no perfil
              </button>
            </div>
          ) : (
            <ReportFullView
              periodType={report.period_type}
              data={report.data}
              narrative={report.narrative}
            />
          )}
        </div>
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </main>
  );
}
