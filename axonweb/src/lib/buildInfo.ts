/**
 * Carimbo do build: o hash do commit de onde este bundle saiu.
 *
 * Existe para responder uma pergunta que o APK sozinho não responde — "o que
 * eu tenho instalado é a versão nova ou a antiga?". O Android não mostra isso
 * em lugar nenhum, e reinstalar por cima não dá nenhum sinal visível de que o
 * código mudou.
 *
 * O valor é injetado no build (`VITE_BUILD_COMMIT`, ver vite.config.js) e fica
 * congelado dentro do bundle. Se o carimbo na tela é o do commit que você
 * acabou de fazer, o APK é o novo — sem depender de memória ou de horário.
 */

/** Hash curto do commit, ou "dev" quando roda fora de um build empacotado. */
export const BUILD_COMMIT: string = import.meta.env.VITE_BUILD_COMMIT ?? "dev";
