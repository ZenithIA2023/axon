import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, Bell, CalendarDays, CalendarPlus, Clock, NotebookPen, Sparkles, Zap } from "lucide-react";

import BottomSheet from "../ui/BottomSheet";
import * as api from "../../lib/api";

// ===========================================================================
// TIPOS DO COMPONENTE
// ===========================================================================

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

// ===========================================================================
// CONSTANTES DE CONFIGURAÇÃO
// ===========================================================================

const WEEK_DAYS = [
  { value: 0, label: "Segunda-feira" },
  { value: 1, label: "Terça-feira" },
  { value: 2, label: "Quarta-feira" },
  { value: 3, label: "Quinta-feira" },
  { value: 4, label: "Sexta-feira" },
  { value: 5, label: "Sábado" },
  { value: 6, label: "Domingo" },
];

const DEFAULT_PREFS: api.PlanningPreferences = {
  daily_planning_enabled: true,
  daily_planning_time: null,
  daily_use_chronotype: true,
  weekly_planning_enabled: true,
  weekly_planning_day: null,
  weekly_use_chronotype: true,
  routine_analysis_enabled: false,
  routine_analysis_time: null,
  task_reminder_enabled: true,
  day_review_reminder_enabled: true,
  plan_tomorrow_reminder_enabled: true,
  day_review_reminder_time: null,
  plan_tomorrow_reminder_time: null,
};

// ===========================================================================
// SHEET DE CONFIGURAÇÕES DE NOTIFICAÇÕES
// ===========================================================================

export default function NotificationSettingsSheet({ isOpen, onClose }: Props) {
  // ---------------------------------------------------------------------------
  // Estado das preferências
  // ---------------------------------------------------------------------------
  const [prefs, setPrefs] =
    useState<api.PlanningPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);

  // Debounce para salvar alterações sem disparar request a cada clique imediato.
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guarda a última alteração pendente para salvar imediatamente ao fechar.
  const pendingPrefs = useRef<api.PlanningPreferences | null>(null);

  // ---------------------------------------------------------------------------
  // Carregamento ao abrir
  // ---------------------------------------------------------------------------
  // Busca preferências atuais; se falhar, mantém uma configuração segura padrão.
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);

    api
      .getPlanningPreferences()
      .then(setPrefs)
      .catch(() => setPrefs(DEFAULT_PREFS))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Salvamento automático
  // ---------------------------------------------------------------------------
  // Aguarda 500ms antes de persistir para evitar excesso de chamadas na API.
  const save = useCallback((updated: api.PlanningPreferences) => {
    pendingPrefs.current = updated;

    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }

    saveTimeout.current = setTimeout(() => {
      api.updatePlanningPreferences(updated).catch(() => {});
      pendingPrefs.current = null;
      saveTimeout.current = null;
    }, 500);
  }, []);

  // Salva imediatamente qualquer alteração pendente antes de fechar/desmontar.
  const flushPendingSave = useCallback(() => {
    if (!pendingPrefs.current) return;

    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }

    api.updatePlanningPreferences(pendingPrefs.current).catch(() => {});
    pendingPrefs.current = null;
  }, []);

  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  function handleClose() {
    flushPendingSave();
    onClose();
  }

  const update = useCallback(
    (patch: Partial<api.PlanningPreferences>) => {
      setPrefs((previousPrefs) => {
        const nextPrefs = { ...previousPrefs, ...patch };

        save(nextPrefs);

        return nextPrefs;
      });
    },
    [save]
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="Notificações"
      subtitle="Configure seus lembretes de planejamento"
      ariaLabel="Configurações de notificações"
    >
      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          <DailyPlanningSection prefs={prefs} onUpdate={update} />
          <DuringDaySection prefs={prefs} onUpdate={update} />
          <EndOfDaySection prefs={prefs} onUpdate={update} />
          <WeeklyPlanningSection prefs={prefs} onUpdate={update} />
          <RoutineAnalysisSection prefs={prefs} onUpdate={update} />
        </div>
      )}
    </BottomSheet>
  );
}

// ===========================================================================
// ESTADOS DA SHEET
// ===========================================================================

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );
}

// ===========================================================================
// SEÇÕES DE CONFIGURAÇÃO
// ===========================================================================

function DailyPlanningSection({
  prefs,
  onUpdate,
}: {
  prefs: api.PlanningPreferences;
  onUpdate: (patch: Partial<api.PlanningPreferences>) => void;
}) {
  return (
    <section>
      <SectionTitle title="Diário" />

      <div className="space-y-3">
        <ToggleRow
          icon={Bell}
          title="Lembrete diário"
          description="Um resumo do seu dia: quantas tarefas e qual é a primeira."
          enabled={prefs.daily_planning_enabled}
          onToggle={() =>
            onUpdate({
              daily_planning_enabled: !prefs.daily_planning_enabled,
            })
          }
        />

        {prefs.daily_planning_enabled && (
          <>
            <ToggleRow
              icon={Zap}
              title="Horário pelo cronótipo"
              description="O Axon define o melhor horário com base no seu perfil."
              enabled={prefs.daily_use_chronotype}
              onToggle={() =>
                onUpdate({
                  daily_use_chronotype: !prefs.daily_use_chronotype,
                })
              }
            />

            {!prefs.daily_use_chronotype && (
              <PickerRow icon={Clock} label="Horário">
                <input
                  type="time"
                  value={prefs.daily_planning_time ?? "08:30"}
                  onChange={(event) =>
                    onUpdate({ daily_planning_time: event.target.value })
                  }
                  className="rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm font-medium text-primary outline-none focus:border-accent-soft"
                  style={{ colorScheme: "dark" }}
                />
              </PickerRow>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// Item 10: aviso de 30 minutos antes. Um interruptor só, sem horário: a
// antecedência é fixa.
function DuringDaySection({
  prefs,
  onUpdate,
}: {
  prefs: api.PlanningPreferences;
  onUpdate: (patch: Partial<api.PlanningPreferences>) => void;
}) {
  return (
    <section>
      <SectionTitle title="Ao longo do dia" />

      <ToggleRow
        icon={AlarmClock}
        title="30 minutos antes"
        description="Aviso antes de tarefas e eventos com horário. Itens de rotina não avisam."
        enabled={prefs.task_reminder_enabled}
        onToggle={() =>
          onUpdate({ task_reminder_enabled: !prefs.task_reminder_enabled })
        }
      />
    </section>
  );
}

// Item 10: os dois avisos de fim do dia. Cada um com interruptor e horário; o
// horário vazio (null) segue o cronotipo, e o padrão aparece no campo para a
// pessoa saber quando vai receber.
function EndOfDaySection({
  prefs,
  onUpdate,
}: {
  prefs: api.PlanningPreferences;
  onUpdate: (patch: Partial<api.PlanningPreferences>) => void;
}) {
  return (
    <section>
      <SectionTitle title="Fim do dia" />

      <div className="space-y-3">
        <ToggleRow
          icon={NotebookPen}
          title="Registro do dia"
          description="Lembra de registrar como foi o dia, se ainda não registrou."
          enabled={prefs.day_review_reminder_enabled}
          onToggle={() =>
            onUpdate({
              day_review_reminder_enabled: !prefs.day_review_reminder_enabled,
            })
          }
        />

        {prefs.day_review_reminder_enabled && (
          <EndOfDayTimeRow
            value={prefs.day_review_reminder_time}
            fallback={prefs.day_review_default_time ?? "21:00"}
            onChange={(value) => onUpdate({ day_review_reminder_time: value })}
          />
        )}

        <ToggleRow
          icon={CalendarPlus}
          title="Organizar o amanhã"
          description="Sugere planejar o dia seguinte, se ele ainda estiver vazio."
          enabled={prefs.plan_tomorrow_reminder_enabled}
          onToggle={() =>
            onUpdate({
              plan_tomorrow_reminder_enabled:
                !prefs.plan_tomorrow_reminder_enabled,
            })
          }
        />

        {prefs.plan_tomorrow_reminder_enabled && (
          <EndOfDayTimeRow
            value={prefs.plan_tomorrow_reminder_time}
            fallback={prefs.plan_tomorrow_default_time ?? "21:30"}
            onChange={(value) => onUpdate({ plan_tomorrow_reminder_time: value })}
          />
        )}
      </div>
    </section>
  );
}

// Horário de um aviso de fim do dia. Mostra o efetivo (personalizado ou do
// cronotipo); quando personalizado, oferece voltar ao do cronotipo.
function EndOfDayTimeRow({
  value,
  fallback,
  onChange,
}: {
  value: string | null;
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <PickerRow icon={Clock} label="Horário">
      <div className="flex flex-col items-end gap-1">
        <input
          type="time"
          value={value ?? fallback}
          onChange={(event) => onChange(event.target.value || null)}
          className="rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm font-medium text-primary outline-none focus:border-accent-soft"
          style={{ colorScheme: "dark" }}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[0.7rem] font-semibold text-accent"
          >
            Usar o do cronotipo ({fallback})
          </button>
        ) : (
          <span className="text-[0.7rem] text-muted">Pelo seu cronotipo</span>
        )}
      </div>
    </PickerRow>
  );
}

function WeeklyPlanningSection({
  prefs,
  onUpdate,
}: {
  prefs: api.PlanningPreferences;
  onUpdate: (patch: Partial<api.PlanningPreferences>) => void;
}) {
  return (
    <section>
      <SectionTitle title="Semanal" />

      <div className="space-y-3">
        <ToggleRow
          icon={CalendarDays}
          title="Lembrete semanal"
          description="Receba um lembrete para planejar sua semana."
          enabled={prefs.weekly_planning_enabled}
          onToggle={() =>
            onUpdate({
              weekly_planning_enabled: !prefs.weekly_planning_enabled,
            })
          }
        />

        {prefs.weekly_planning_enabled && (
          <>
            <ToggleRow
              icon={Zap}
              title="Horário pelo cronótipo"
              description="O Axon define o melhor horário com base no seu perfil."
              enabled={prefs.weekly_use_chronotype}
              onToggle={() =>
                onUpdate({
                  weekly_use_chronotype: !prefs.weekly_use_chronotype,
                })
              }
            />

            {!prefs.weekly_use_chronotype && (
              <PickerRow icon={CalendarDays} label="Dia da semana">
                <select
                  value={prefs.weekly_planning_day ?? 0}
                  onChange={(event) =>
                    onUpdate({
                      weekly_planning_day: Number(event.target.value),
                    })
                  }
                  className="rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm font-medium text-primary outline-none focus:border-accent-soft"
                  style={{ colorScheme: "dark" }}
                >
                  {WEEK_DAYS.map((day) => (
                    <option
                      key={day.value}
                      value={day.value}
                      className="bg-surface-elevated"
                    >
                      {day.label}
                    </option>
                  ))}
                </select>
              </PickerRow>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// Análise completa de rotina agendada. Segue o padrão das seções acima; a
// diferença é que aqui não há "horário pelo cronótipo": o usuário escolhe
// quando quer receber a proposta do dia seguinte.
function RoutineAnalysisSection({
  prefs,
  onUpdate,
}: {
  prefs: api.PlanningPreferences;
  onUpdate: (patch: Partial<api.PlanningPreferences>) => void;
}) {
  return (
    <section>
      <SectionTitle title="Análise da rotina" />

      <div className="space-y-3">
        <ToggleRow
          icon={Sparkles}
          title="Analisar o dia seguinte"
          description="O Axon revisa sua agenda de amanhã e envia uma proposta. Nada muda sem você aprovar."
          enabled={prefs.routine_analysis_enabled}
          onToggle={() =>
            onUpdate({
              routine_analysis_enabled: !prefs.routine_analysis_enabled,
              // Liga com um horário padrão para o agendamento já valer: sem
              // horário o scheduler não dispara, e o usuário achava que estava
              // ligado.
              ...(prefs.routine_analysis_enabled || prefs.routine_analysis_time
                ? {}
                : { routine_analysis_time: "20:00" }),
            })
          }
        />

        {prefs.routine_analysis_enabled && (
          <PickerRow icon={Clock} label="Horário">
            <input
              type="time"
              value={prefs.routine_analysis_time ?? "20:00"}
              onChange={(event) =>
                onUpdate({ routine_analysis_time: event.target.value })
              }
              className="rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm font-medium text-primary outline-none focus:border-accent-soft"
              style={{ colorScheme: "dark" }}
            />
          </PickerRow>
        )}
      </div>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-soft">
      {title}
    </p>
  );
}

// ===========================================================================
// LINHAS DE CONFIGURAÇÃO
// ===========================================================================

function ToggleRow({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-[1.7rem] border border-soft bg-surface-elevated p-4 text-left text-primary shadow-card backdrop-blur-2xl transition active:scale-[0.99]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>

      <div
        className={`flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition ${
          enabled
            ? "justify-end border-accent-soft bg-accent-soft"
            : "justify-start border-soft bg-surface-muted"
        }`}
      >
        <div
          className={`h-5 w-5 rounded-full transition ${
            enabled ? "bg-[var(--accent)]" : "bg-[var(--text-soft)]"
          }`}
        />
      </div>
    </button>
  );
}

function PickerRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[1.7rem] border border-soft bg-surface-elevated p-4 text-primary shadow-card backdrop-blur-2xl">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
        <Icon className="h-5 w-5" />
      </div>

      <p className="flex-1 text-sm font-semibold text-primary">{label}</p>

      {children}
    </div>
  );
}
