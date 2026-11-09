// ===========================================================================
// TIPOS DOS RESULTADOS DE CRONOTIPO
// ===========================================================================
// Chaves usadas pelas páginas Result/Profile e pelo mapeamento vindo da API.
export type ChronotypeResultKey =
  | "Matutino"
  | "Vespertino"
  | "Noturno"
  | "Misto"
  | "Bimodal";

// Estrutura completa consumida pela página Result.tsx e pelos cards de perfil.
export type ChronotypeResult = {
  label: string;
  title: string;
  subtitle: string;
  description: string;

  // Métricas rápidas exibidas nos cards do resultado.
  focusWindow: string;
  energyPeak: string;
  lowEnergy: string;

  // Recomendação resumida e dicas iniciais para rotina.
  recommendation: string;
  routineTips: string[];

  // Conteúdo detalhado exibido na tela de resultado completo.
  summary: string;
  idealStart: string;
  idealEnd: string;
  bestActivities: string[];
  avoid: string[];
  // O que o Axon FAZ com o resultado. Cada frase precisa existir no código
  // (revisado em 09/11/2026): horário escolhido pelo pico em
  // routines_service.pick_best_slot ("Axon decide" e rotinas); aviso de tarefa
  // em bloco de sono/recuperação em notification_analyzer; calibração após 14
  // registros em calibration_service. Os textos antigos prometiam "perguntar o
  // estado do usuário" e "sugerir pausas", que o app não faz. Não prometa o que
  // não existe: aparece no onboarding e no relatório do Perfil (Result.tsx).
  axonSetup: string[];
  // Blocos sugeridos exibidos como janelas de foco no resultado completo.
  focusBlocks: {
    period: string;
    title: string;
    description: string;
  }[];

  // Tags curtas exibidas no card principal do resultado.
  profileTags: string[];
};

// ===========================================================================
// CONTEÚDO DOS RESULTADOS
// ===========================================================================
// Cada entrada descreve como o Axon deve explicar e adaptar a experiência
// para o cronotipo calculado no questionário.
export const results: Record<ChronotypeResultKey, ChronotypeResult> = {
  // ---------------------------------------------------------------------------
  // MATUTINO
  // ---------------------------------------------------------------------------
  Matutino: {
    label: "Cronotipo Matutino",
    title: "Você rende melhor nas primeiras horas do dia.",
    subtitle:
      "Seu corpo tende a atingir maior clareza mental, energia e disposição no início do dia.",
    description:
      "Pessoas com perfil matutino costumam ter mais facilidade para acordar cedo, iniciar tarefas importantes logo pela manhã e perder desempenho conforme a tarde avança. Para você, começar bem o dia é uma vantagem estratégica.",

    focusWindow: "Manhã",
    energyPeak: "6h às 11h",
    lowEnergy: "Fim da tarde e noite",

    recommendation:
      "Reserve suas tarefas mais difíceis para a manhã. Depois das 14h, prefira tarefas leves, revisões, organização e atividades de menor carga mental.",

    routineTips: [
      "Acorde no mesmo horário todos os dias.",
      "Faça sua tarefa mais importante antes das 10h.",
      "Evite reuniões longas no fim da tarde.",
    ],

    summary:
      "Seu melhor desempenho aparece quando o dia ainda está começando. O Axon deve proteger suas manhãs para tarefas importantes e evitar sobrecarregar sua agenda no fim do dia.",
    idealStart: "6h às 8h",
    idealEnd: "21h30 às 23h",
    bestActivities: [
      "Trabalho profundo pela manhã",
      "Estudos e decisões importantes cedo",
      "Planejamento do dia logo após acordar",
      "Exercícios físicos no começo do dia",
    ],
    avoid: [
      "Deixar tarefas difíceis para a noite",
      "Agendar reuniões decisivas no fim da tarde",
      "Começar o dia sem prioridade definida",
    ],
    axonSetup: [
      "Quando o Axon escolher o horário, suas tarefas mais importantes vão para a manhã, o seu pico de energia.",
      "Se uma tarefa cair num horário em que você costuma estar sem energia, ele avisa e sugere outro melhor.",
      "Com 14 registros diários, seu mapa de energia passa a seguir o seu ritmo real, não só o do cronotipo.",
    ],
    focusBlocks: [
      {
        period: "06h - 08h",
        title: "Ativação",
        description:
          "Bom momento para acordar, revisar o dia e iniciar com clareza.",
      },
      {
        period: "08h - 11h",
        title: "Foco máximo",
        description:
          "Melhor janela para tarefas difíceis, estudos e decisões.",
      },
      {
        period: "14h - 17h",
        title: "Execução leve",
        description:
          "Ideal para tarefas operacionais, revisão e organização.",
      },
    ],
    profileTags: ["Energia cedo", "Alta clareza matinal", "Queda à noite"],
  },

  // ---------------------------------------------------------------------------
  // VESPERTINO
  // ---------------------------------------------------------------------------
  Vespertino: {
    label: "Cronotipo Vespertino",
    title: "Você ganha energia conforme o dia avança.",
    subtitle:
      "Seu ritmo tende a começar mais lento e melhorar à tarde, quando sua mente fica mais ativa.",
    description:
      "Pessoas vespertinas geralmente não performam tão bem nas primeiras horas da manhã. Seu melhor desempenho aparece quando o corpo já teve tempo para despertar completamente, especialmente no período da tarde e início da noite.",

    focusWindow: "Tarde e início da noite",
    energyPeak: "14h às 20h",
    lowEnergy: "Primeiras horas da manhã",

    recommendation:
      "Não force tarefas complexas logo cedo. Use a manhã para tarefas simples e reserve a tarde para o que exige mais energia, criatividade e concentração.",

    routineTips: [
      "Use a manhã para tarefas simples e automáticas.",
      "Proteja o bloco da tarde para projetos importantes.",
      "Evite dormir muito tarde — isso prejudica o ciclo.",
    ],

    summary:
      "Seu desempenho cresce ao longo do dia. O Axon deve evitar te cobrar alta performance logo cedo e concentrar as tarefas mais importantes na tarde.",
    idealStart: "8h30 às 10h",
    idealEnd: "23h às 00h30",
    bestActivities: [
      "Projetos importantes à tarde",
      "Reuniões estratégicas depois do meio-dia",
      "Atividades criativas no fim da tarde",
      "Tarefas leves durante a manhã",
    ],
    avoid: [
      "Forçar foco profundo logo ao acordar",
      "Agendar decisões importantes muito cedo",
      "Estender o trabalho até muito tarde todos os dias",
    ],
    axonSetup: [
      "Quando o Axon escolher o horário, suas tarefas mais importantes vão para a tarde, longe das suas manhãs mais lentas.",
      "Se uma tarefa cair num horário em que você costuma estar sem energia, ele avisa e sugere outro melhor.",
      "Com 14 registros diários, seu mapa de energia passa a seguir o seu ritmo real, não só o do cronotipo.",
    ],
    focusBlocks: [
      {
        period: "08h - 11h",
        title: "Aquecimento",
        description:
          "Bom momento para tarefas simples, mensagens e organização.",
      },
      {
        period: "14h - 18h",
        title: "Foco principal",
        description:
          "Melhor janela para tarefas profundas e decisões importantes.",
      },
      {
        period: "18h - 20h",
        title: "Criatividade",
        description:
          "Bom período para ideias, revisão e projetos pessoais.",
      },
    ],
    profileTags: ["Energia à tarde", "Manhã lenta", "Boa criatividade"],
  },

  // ---------------------------------------------------------------------------
  // NOTURNO
  // ---------------------------------------------------------------------------
  Noturno: {
    label: "Cronotipo Noturno",
    title: "Seu pico de clareza aparece quando o mundo desacelera.",
    subtitle:
      "Você tende a ter mais energia mental à noite, quando há menos ruído externo e mais sensação de controle.",
    description:
      "Pessoas com perfil noturno costumam ter dificuldade para performar cedo, mas podem atingir grande profundidade mental no período da noite. O desafio é usar esse pico sem comprometer o sono e o funcionamento do dia seguinte.",

    focusWindow: "Noite",
    energyPeak: "20h às 01h",
    lowEnergy: "Manhã",

    recommendation:
      "Quando possível, concentre tarefas críticas no período noturno. Proteja seu sono compensando no horário certo e evite compromissos muito cedo.",

    routineTips: [
      "Use a manhã apenas para o essencial.",
      "Evite compromissos importantes muito cedo.",
      "Proteja blocos noturnos para foco profundo.",
    ],

    summary:
      "Você tende a ganhar clareza quando o dia desacelera. O Axon deve respeitar seu pico noturno, mas também proteger seu sono para evitar desgaste acumulado.",
    idealStart: "9h30 às 11h",
    idealEnd: "00h30 às 02h",
    bestActivities: [
      "Trabalho criativo à noite",
      "Estudo profundo após o fim do dia",
      "Revisão e planejamento noturno",
      "Projetos individuais com pouca interrupção",
    ],
    avoid: [
      "Compromissos críticos pela manhã",
      "Dormir tarde sem ajustar a rotina",
      "Usar o pico noturno para tarefas pouco importantes",
    ],
    axonSetup: [
      "Quando o Axon escolher o horário, suas tarefas mais importantes vão para o fim do dia, onde fica o seu pico.",
      "Se uma tarefa cair num horário em que você costuma estar sem energia, ele avisa e sugere outro melhor.",
      "Com 14 registros diários, seu mapa de energia passa a seguir o seu ritmo real, não só o do cronotipo.",
    ],
    focusBlocks: [
      {
        period: "09h - 12h",
        title: "Entrada lenta",
        description:
          "Período melhor para tarefas simples e organização básica.",
      },
      {
        period: "16h - 19h",
        title: "Retomada",
        description:
          "Energia começa a subir e pode ser usada para execução média.",
      },
      {
        period: "20h - 01h",
        title: "Foco profundo",
        description:
          "Janela principal para tarefas difíceis, criativas e analíticas.",
      },
    ],
    profileTags: ["Pico noturno", "Manhã fraca", "Alta profundidade"],
  },

  // ---------------------------------------------------------------------------
  // MISTO
  // ---------------------------------------------------------------------------
  Misto: {
    label: "Cronotipo Misto",
    title: "Seu ritmo varia — e isso é uma característica, não um problema.",
    subtitle:
      "Você não apresenta um padrão fixo o suficiente para ser definido como matutino, vespertino ou noturno.",
    description:
      "O perfil misto costuma variar conforme sono, carga mental, compromissos, ambiente e hábitos. Isso significa que sua produtividade depende muito do contexto, e não apenas do relógio.",

    focusWindow: "Depende do contexto",
    energyPeak: "Varia por dia",
    lowEnergy: "Sem padrão fixo",

    recommendation:
      "Seu desafio é identificar seus micro-picos. O Axon vai ajudar você a mapear seu padrão real ao longo do tempo e ajustar seu planejamento diariamente.",

    routineTips: [
      "Observe em quais dias e horários você rende mais.",
      "Evite rotinas rígidas — prefira estruturas flexíveis.",
      "Use o chat do Axon para planejar cada dia individualmente.",
    ],

    summary:
      "Seu ritmo precisa ser observado em movimento. O Axon deve funcionar como um sistema adaptativo, ajustando seu planejamento conforme seus dados reais aparecem.",
    idealStart: "Variável",
    idealEnd: "Variável",
    bestActivities: [
      "Planejamento diário flexível",
      "Blocos curtos de teste de foco",
      "Revisão frequente de energia",
      "Organização por prioridade, não apenas por horário",
    ],
    avoid: [
      "Rotinas muito rígidas",
      "Copiar horários de outras pessoas",
      "Ignorar sinais de cansaço ou oscilação",
    ],
    axonSetup: [
      "Quando o Axon escolher o horário, suas tarefas mais importantes vão para os blocos de mais energia do seu dia.",
      "Se uma tarefa cair num horário em que você costuma estar sem energia, ele avisa e sugere outro melhor.",
      "No seu caso, os registros diários contam ainda mais: com 14 deles, o Axon passa a seguir os picos que você mostra de verdade.",
    ],
    focusBlocks: [
      {
        period: "Manhã",
        title: "Teste de energia",
        description:
          "Avalie se o dia começou com clareza ou se precisa de aquecimento.",
      },
      {
        period: "Tarde",
        title: "Bloco adaptativo",
        description:
          "Ajuste tarefas conforme energia, urgência e disponibilidade.",
      },
      {
        period: "Noite",
        title: "Revisão",
        description:
          "Observe o que funcionou e alimente o Axon com esse padrão.",
      },
    ],
    profileTags: ["Flexível", "Contextual", "Adaptativo"],
  },

  // ---------------------------------------------------------------------------
  // BIMODAL
  // ---------------------------------------------------------------------------
  Bimodal: {
    label: "Cronotipo Bimodal",
    title: "Você tem dois picos de energia bem definidos.",
    subtitle:
      "Seu ritmo tende a funcionar em dois momentos fortes, separados por uma queda de energia no meio do dia.",
    description:
      "Pessoas com perfil bimodal costumam ter uma boa janela de energia pela manhã e outra à noite. O desafio é não desperdiçar esses dois picos e respeitar o período de menor disposição entre eles.",

    focusWindow: "9h-12h e 20h-23h",
    energyPeak: "Manhã e noite",
    lowEnergy: "Início da tarde",

    recommendation:
      "Aproveite os dois picos para tarefas de alto esforço. Proteja a tarde para descanso, tarefas leves ou atividades operacionais.",

    routineTips: [
      "Use a manhã para o trabalho analítico.",
      "Descanse ou faça tarefas leves entre 13h e 17h.",
      "Reserve a noite para projetos criativos ou revisão.",
    ],

    summary:
      "Seu dia funciona melhor em dois blocos fortes. O Axon deve distribuir tarefas complexas entre manhã e noite, evitando sobrecarregar o início da tarde.",
    idealStart: "7h às 9h",
    idealEnd: "23h às 00h30",
    bestActivities: [
      "Tarefas analíticas pela manhã",
      "Projetos criativos à noite",
      "Revisões no segundo pico",
      "Tarefas leves no início da tarde",
    ],
    avoid: [
      "Agendar tarefas complexas no início da tarde",
      "Usar os dois picos com tarefas pequenas",
      "Ignorar a necessidade de pausa entre blocos",
    ],
    axonSetup: [
      "Quando o Axon escolher o horário, suas tarefas mais importantes vão para os seus dois picos, de manhã e no começo da noite.",
      "Se uma tarefa cair num horário em que você costuma estar sem energia, ele avisa e sugere outro melhor.",
      "Com 14 registros diários, seu mapa de energia passa a seguir o seu ritmo real, não só o do cronotipo.",
    ],
    focusBlocks: [
      {
        period: "09h - 12h",
        title: "Primeiro pico",
        description:
          "Ideal para análise, estudo, decisões e tarefas estratégicas.",
      },
      {
        period: "13h - 17h",
        title: "Vale de energia",
        description:
          "Melhor para tarefas leves, pausas e rotinas automáticas.",
      },
      {
        period: "20h - 23h",
        title: "Segundo pico",
        description:
          "Bom para criatividade, revisão e projetos importantes.",
      },
    ],
    profileTags: ["Dois picos", "Queda à tarde", "Criatividade noturna"],
  },
};
