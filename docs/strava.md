# Strava

Estado: integrado na app **mobile** (`apps/mobile/src/lib/strava.ts`, `components/StravaSheet.tsx`), com o login
feito pelo serviço do site (`scripts/strava-auth.mjs`, guarda o client secret). A conversão de streams em ride vive
no core (`packages/core/src/telemetry/strava.ts`), por isso serve também ao desktop. A integração no **desktop**
(`apps/web` + `apps/server`) está prevista; este documento junta o que é preciso saber antes de avançar.

## IDs de 64 bits (obrigatório a partir de 1 de junho de 2027)

A Strava avisou (email aos developers, nov. 2026) que, depois de **2027-06-01**, os `id` de **Activities** e
**Athletes** podem ser inteiros de 64 bits. Em JavaScript/TypeScript um `number` só guarda inteiros exatos até
2^53 − 1 (`Number.MAX_SAFE_INTEGER`): `JSON.parse`, `res.json()` e o `CapacitorHttp` arredondam o resto **sem
erro**, e o id passa a apontar para outra atividade (ou para nenhuma). A Strava devolve agora também `id_str`, o
mesmo valor em texto, e recomenda usá-lo.

Regras (já aplicadas no mobile e no serviço de login):

- **Usar sempre `stravaId(obj)`** (`@telemesync/core`) para obter o id de uma atividade ou atleta. Devolve `id_str`
  quando existe e só aceita o `id` numérico enquanto ainda é exato; caso contrário lança erro em vez de usar um id
  errado.
- O id é **string** em todo o lado: URLs (`/activities/${key}/streams`), keys de React, estado, mapas, cache,
  comparações. Nunca `Number(id)`, `parseInt(id)`, `+id`, nem ordenar por id (ordenar por `start_date`).
- O `id` numérico do tipo `StravaActivity` fica só por compatibilidade; não o usar.
- O serviço de login (`tokenReply`) envia o atleta com `id: id_str`. Sessões guardadas no telemóvel antes desta alteração
  têm o id como número; não é usado para nada, por isso não há migração.

### Checklist para a integração no desktop

1. **Login**: reutilizar o mesmo fluxo e o `scripts/strava-auth.mjs` (novo modo em `RETURN_TO`, p. ex. retorno para
   `http://localhost:<porta>/…`), ou um fluxo próprio no `apps/server`. Em qualquer caso, quem receber a resposta do
   token guarda `athlete.id_str`, nunca `athlete.id`.
2. **Lista de atividades**: mapear cada item para `{ ...a, key: stravaId(a) }` logo à entrada (como em
   `listActivities` do mobile) e usar só `key` daí para a frente.
3. **`apps/server` (Node)**: o `JSON.parse` do Node tem o mesmo problema. Se o servidor fizer pedidos à Strava, usar
   `id_str`; se passar ids ao browser, passá-los como string.
4. **Persistência** (projetos guardados, cache de streams, base de dados): guardar o id como texto (ou `BIGINT`/
   `INTEGER` de 64 bits numa BD, mas lido para string no JS). Projetos já guardados com id numérico pequeno continuam
   válidos via `stravaId({ id })`.
5. **Outros sítios onde aparecem ids de atividade/atleta**, a verificar na altura na documentação da API (o email só
   fala do campo `id` dos dois objetos):
   - eventos de **webhook** (`object_id`, `owner_id`): se se usarem webhooks, ler o corpo sem perder precisão
     (procurar campos `_str` ou usar um parser que preserve inteiros grandes, p. ex. `JSON.parse` com `reviver` +
     `context.source`, ou `json-bigint`);
   - objetos aninhados (`athlete` dentro de uma atividade, `activity` dentro de segment efforts/laps);
   - resposta de **uploads** (`activity_id`).
6. **Testes**: incluir um caso com um id acima de 2^53 (ver `packages/core/test/strava.test.ts`:
   `9007199254740993`, que `JSON.parse` lê como `…992`).

## Outras notas

- Scope pedido: `read,activity:read_all`. Tokens ficam no dispositivo; o site não guarda nada.
- Streams pedidas: `STRAVA_STREAM_KEYS` no core. `stravaToRaw` transforma-as no mesmo `RawTelemetry` que um FIT/GPX.
- `activityForClip` escolhe a atividade em que um clip foi filmado (pela hora de início).
