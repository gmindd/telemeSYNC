# Timestamps por câmara

> **Estado: NÃO VALIDADO.** As interpretações abaixo são hipóteses iniciais, codificadas em
> `packages/core/src/sync/profiles.ts` com `verified: false`. Cada linha tem de ser confirmada com
> ficheiros reais antes de passar a `verified: true`.

## Como validar

1. Para cada câmara, gravar 2–3 clips curtos com o ciclocomputador visível no início (hora do GPS no ecrã),
   ou anotar a hora real de início de cada clip.
2. Correr `npm run inspect -- <clips…> <volta.fit> --out fixtures/real` e preencher `groundTruth.realStartLocal`
   em cada JSON gerado.
3. Comparar `groundTruth` com `interpretations` (creation_time como UTC, como hora local, menos a duração,
   nome do ficheiro, timecode) e registar abaixo qual bate certo.
4. Os JSON entram como fixtures nos testes (`packages/core/test`), para que a interpretação fique fixada.

## Hipóteses atuais

| Câmara | Ordem dos resolvers | `creation_time` | Nome do ficheiro | Notas |
|---|---|---|---|---|
| **DJI Osmo Action** | manual → nome → creation_time | **UTC real, início** *(indício forte, 1 ficheiro)* | `DJI_YYYYMMDDHHMMSS_NNNN_D.MP4`, **hora local de início** *(indício forte)* | Modelos antigos usam `DJI_0001.MP4` (sem data). Gravações longas são divididas em vários ficheiros com nomes próprios. |
| **GoPro** | manual → GPMF (Fase 3) → creation_time → timecode | hora local gravada como UTC, início *(quirk conhecido; por validar no modelo do utilizador)* | `GX01xxxx.MP4` (sem data) | Capítulos `GX01xxxx`, `GX02xxxx`… são encadeados: o capítulo N+1 começa onde o N acaba. Com GPS ligado, a track GPMF tem `GPSU` (UTC real). |
| **Insta360 X4** | manual → nome → creation_time | UTC, início *(por validar)* | `VID_YYYYMMDD_HHMMSS_00_NNN.insv`, hora local *(por validar)* | MP4 exportado do Insta360 Studio: `creation_time` pode ser a data de exportação e o início pode estar aparado → aviso automático. |
| **Genérico** | manual → creation_time → nome → timecode | UTC, início | padrões `YYYYMMDD_HHMMSS` | |

Fuso por defeito: `Europe/Lisbon` (hora de verão tratada pelo `Intl`). Cada câmara tem o seu fuso configurável.

## Resultados das validações

_(a preencher com os ficheiros reais)_

| Câmara / modelo / firmware | Ficheiro | Hora real de início | Resolver correto | Desvio | Observações |
|---|---|---|---|---|---|
| DJI Osmo Action (modelo por confirmar) | `DJI_20261011094817_0011_D.MP4` (1:25, 1,1 GB) | por confirmar com o FIT | nome = 09:48:17 local; creation_time ≈ 08:48 UTC | — | O Windows ("Suporte criado") converte o creation_time de UTC para hora local e mostra 09:48. Se fosse hora local gravada como UTC mostraria 10:48; se fosse o fim da gravação mostraria 09:49. **Conclusão: creation_time em UTC, início da gravação, coerente com o nome.** O Windows só mostra minutos: falta confirmar os segundos com `npm run inspect` e o desvio real com o FIT. |
