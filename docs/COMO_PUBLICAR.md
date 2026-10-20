# Como publicar alterações

Três destinos independentes. Depois de commitar, atualize os que mudaram.

| Onde | Como | Quem vê |
|---|---|---|
| **Site** axonapp.tech | `./scripts/deploy.sh site` | quem acessa pelo navegador |
| **Backend** api.axonapp.tech | `./scripts/deploy.sh backend` | site e app (é a mesma API) |
| **App mobile** | `./scripts/build-apk.sh` + reinstalar | quem tem o APK instalado |

## O fluxo normal

```bash
# 1. commitar e enviar (o VPS puxa do GitHub)
git add -A
git commit -m "descrição da mudança"
git push

# 2. publicar site + backend de uma vez
./scripts/deploy.sh

# 3. só se o app precisa da mudança
./scripts/build-apk.sh
```

O `deploy.sh` pede a senha do root do VPS uma ou duas vezes.

## O que atualizar em cada caso

**Mexeu só no frontend** (`axonweb/src/`)
```bash
./scripts/deploy.sh site
```
E, se o app precisa da mudança, `./scripts/build-apk.sh`.

**Mexeu só no backend** (`backend/`)
```bash
git push && ./scripts/deploy.sh backend
```
Site e app pegam automaticamente — os dois chamam a mesma API.

**Mexeu nos dois**
```bash
git push && ./scripts/deploy.sh
```

**Criou uma migration**
Aplique o SQL no Supabase **antes** de reiniciar o backend, senão ele salva
campos que a tabela não tem.

## Por que o app é diferente

O site é servido pelo VPS: trocar os arquivos atualiza todo mundo na hora.

O app tem a interface **empacotada dentro do APK**. Não existe atualização
automática num APK instalado à mão — é exatamente isso que a Play Store passa a
resolver quando o app for publicado.

Enquanto isso, cada mudança de frontend que precise chegar ao celular exige
gerar e reinstalar o APK.

> **Se mudou algum plugin nativo** (`@capacitor/...`), **desinstale o app antes
> de instalar**. Código nativo novo não sobrescreve o antigo de forma
> confiável, e o plugin falha em silêncio — foi o que aconteceu na fase 3 do
> push.

## Testar antes de gerar o APK

O site e o app rodam o mesmo código. Publique no site primeiro e teste em
axonapp.tech — se funcionar lá, funciona no app. Economiza um ciclo de
compilar + baixar + instalar.

### Pré-visualizar o design mobile no navegador

Desde 19/10/2026, **abaixo de 1024px de largura o site renderiza o shell de
aplicativo**: a barra inferior aparece, e dentro de uma conversa o campo de
mensagem é o da barra (não o da tela). Basta estreitar a janela do navegador —
arrastar através de 1024px troca o layout na hora, sem recarregar.

Serve para conferir alteração de design mobile sem gerar e reinstalar um APK a
cada ajuste. O desktop (a partir de 1024px) não mudou: segue com a Sidebar e o
compositor dentro da conversa.

> **O que a pré-visualização NÃO mostra: a safe area.**
>
> `env(safe-area-inset-*)` vale **zero** no navegador — não há entalhe nem barra
> de sistema para medir. O respiro das bordas do aparelho (topo sob a câmera,
> rodapé acima dos botões de navegação do Android) só existe no APK.
>
> Ou seja: a pré-visualização mostra **estrutura** igual — barra, compositor,
> layout, componentes, cores. Bug de corte ou de espaçamento no topo e no
> rodapé continua aparecendo só no aparelho. Antes de dar uma mudança de layout
> por concluída, confira no APK.

## Verificar se deu certo

```bash
curl https://axonapp.tech            # site no ar
curl https://api.axonapp.tech        # {"status":"ok"}
```

No VPS:
```bash
systemctl status axon-api --no-pager   # active (running)
journalctl -u axon-api -n 50           # últimos logs
git -C /opt/axon-app log --oneline -1  # qual commit está lá
```

O último comando é o mais útil quando algo "não atualizou": se o commit for
antigo, o `git pull` não pegou.

## Quando algo dá errado

**Site atualizado mas app não** — normal. O app só muda ao reinstalar o APK.

**"Não atualizou nada"** — confira se o `git push` foi feito. O VPS puxa do
GitHub; o que ficou só no Codespace não chega lá.

**Backend com erro depois do deploy** — veja `journalctl -u axon-api -n 50`.
Causa comum: migration não aplicada no Supabase.

**APK baixa como página HTML** — a porta 8080 está privada. No painel PORTS,
botão direito na 8080 → Port Visibility → Public.

**404 NOT_FOUND ao recarregar uma rota interna** (ex.: `/app-loading`,
`/dashboard`) — falta o fallback de SPA no host.

Na web o app usa `BrowserRouter`, então `/dashboard` existe só dentro do
JavaScript: enquanto se navega pelo app o React resolve a rota, mas ao
RECARREGAR o navegador pede aquele caminho ao servidor, que não tem arquivo
nenhum ali. Aparece muito depois do login, porque a URL fica em
`/app-loading`.

O Nginx do VPS já resolve — é o `try_files $uri $uri/ /index.html` do
`docs/play-store/DEPLOY_VPS.md`. **Qualquer host estático novo precisa do
equivalente**, senão esse 404 volta. A regra é sempre a mesma: caminho que não
corresponde a um arquivo cai no `index.html`. O fallback é avaliado depois da
busca por arquivo, então `assets/` e `legal/` continuam sendo servidos como
arquivos de verdade.

> Hospedagem nova também precisa entrar no CORS do backend: o `main.py` libera
> só o `FRONTEND_URL` e o que estiver em `CORS_ORIGINS`. Sem isso o login falha
> por CORS, e não por 404. Lembre que a variável mora no `.env` da VPS e **não
> viaja no deploy** — tem que ser editada lá.
