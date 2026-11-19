# Domínio telemesync.app

O site passa de `telemesync.pereiragabriel.com` para **`telemesync.app`**. Os dois domínios servem **o mesmo
contentor** no Coolify, para sempre: nada redireciona, nada se desliga.

## Porque é que o domínio antigo nunca se pode desligar

| O quê | Endereço fixo no código já distribuído |
| --- | --- |
| Aviso de atualizações do programa, versões **até à 1.2.0** | `https://telemesync.pereiragabriel.com/data/latest.json` |
| Login no Strava da app móvel (todas as versões até agora) | `https://telemesync.pereiragabriel.com/api/strava/…` |
| Política de privacidade aberta pela app móvel | `https://telemesync.pereiragabriel.com/legal.html#strava` |
| Webhook do Buy Me a Coffee (configurado no BMC) | `https://telemesync.pereiragabriel.com/api/bmc-webhook` |

Não redirecionar `/data/latest.json` nem `/api/*` do domínio antigo: o programa pede o ficheiro a partir de
`localhost` (CORS) e uma resposta 301 do proxy não traz `Access-Control-Allow-Origin`, por isso o browser bloqueia-a e
o aviso deixa de aparecer sem dar erro. O Strava também não segue redirecionamentos no `redirect_uri`.

## Como fica o aviso de atualizações

- **Até à 1.2.0**: leem só o domínio antigo → continuam a funcionar porque o domínio antigo serve o mesmo ficheiro.
- **A partir da 1.2.1** (este código): leem primeiro `https://telemesync.app/data/latest.json`; se esse falhar (sem
  resposta, erro HTTP ou ficheiro inválido), leem o domínio antigo (`APP_INFO.updateUrls` em `apps/web/src/config.ts`).
  Por isso a 1.2.1 funciona mesmo que o novo domínio ainda não esteja no ar quando for lançada.

Ou seja: a 1.2.1 é a última versão anunciada só pelo domínio antigo; a 1.2.2 já é procurada no `telemesync.app`.
O ficheiro é um só (`site/data/latest.json`), servido nos dois domínios; não há nada a publicar duas vezes.

## Passos (por esta ordem)

1. **DNS** — no registo do `telemesync.app`: registo `A` para `@` (e `www`, se o quiseres) com o IP do servidor do
   Coolify (o mesmo para onde aponta `telemesync.pereiragabriel.com`). Se o servidor tiver IPv6, também `AAAA`.
2. **Coolify** — na aplicação do site, em *Domains*, acrescentar o novo domínio **sem tirar o antigo**, separado por
   vírgula:
   `https://telemesync.pereiragabriel.com,https://telemesync.app,https://www.telemesync.app`
   Guardar e fazer *Redeploy*; o Coolify pede o certificado HTTPS ao Let's Encrypt sozinho (precisa do DNS já ativo).
3. **Confirmar** que os dois respondem com o mesmo ficheiro e com CORS:
   ```powershell
   curl.exe -sI https://telemesync.app/data/latest.json
   ```
   ```powershell
   curl.exe -sI https://telemesync.pereiragabriel.com/data/latest.json
   ```
   Os dois têm de dar `200` e `access-control-allow-origin: *`.
4. **Só depois do passo 3**: enviar este branch para o `main` e fazer *Redeploy*. Muda os URLs do site (canonical,
   hreflang, `og:`, sitemap, `robots.txt`) e o link das novidades em `latest.json` para o `telemesync.app`. Antes do
   domínio estar no ar isto apontaria os motores de busca e o link "Novidades" das versões antigas para um endereço que
   não responde.
5. **Lançar a 1.2.1** normalmente (README → "Lançar uma versão"). Não é preciso fazer nada de especial: o código desta
   mudança vai nela.
6. **Google Search Console** (opcional): acrescentar a propriedade `telemesync.app` e submeter
   `https://telemesync.app/sitemap.xml`. A *Change of Address* do Search Console não serve aqui porque exige 301 em
   todo o domínio antigo.

## O que fica de propósito no domínio antigo

- **App móvel** (`apps/mobile/src/lib/strava.ts`, `SITE`): login no Strava e link da privacidade. O *Authorization
  Callback Domain* da aplicação da API do Strava aceita um só domínio, e as apps já instaladas mandam o
  `redirect_uri` do domínio antigo; mudá-lo partia o login nessas apps. Só mudar quando houver uma razão forte e
  depois de a revisão do Strava Developer Program acabar (os URLs submetidos estão em `docs/strava-developer-program.md`).
- **Webhook do Buy Me a Coffee**: continua a funcionar no domínio antigo; pode passar para
  `https://telemesync.app/api/bmc-webhook` nas definições do BMC quando quiseres (o segredo é o mesmo).
- **Estatísticas**: contam os dois domínios (o log é do contentor); visitas que vêm de um para o outro não contam
  como origem externa (`refName` em `scripts/visits.mjs`).

## Mais tarde (opcional, quando quase ninguém usar ≤ 1.2.0)

Redirecionar só as **páginas** do domínio antigo para o novo, no `scripts/nginx-site.conf`, dentro do `server { }`,
antes dos `location`:

```nginx
# Páginas do domínio antigo → telemesync.app (o aviso de atualizações e as APIs continuam a responder aqui)
set $old_page 0;
if ($host = telemesync.pereiragabriel.com) { set $old_page 1; }
if ($uri ~ ^/(data|api)/) { set $old_page 0; }
if ($old_page) { return 301 https://telemesync.app$request_uri; }
```

`/data/` fica de fora para o `latest.json` (e as estatísticas e apoiantes lidos pelas páginas, que já estariam no
domínio novo); `/api/` para o Strava e o Buy Me a Coffee.
