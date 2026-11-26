# Candidatura ao Strava Developer Program (mais de 10 atletas)

A aplicação Strava do telemeSYNC (client ID `291951`) está no Standard Tier: 10 atletas no máximo. Para passar disso é
preciso submeter o formulário do Strava Developer Program e esperar pela revisão (sem prazo; relatos de semanas a meses):
https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8

Condições do Strava (formulário e https://developers.strava.com/docs/rate-limits/, lidos a 2026-11-18):

- Só revêem apps que **já chegaram aos 10 atletas**; as outras são recusadas.
- O aumento não é garantido e pode ser menor do que o pedido.
- O Standard Tier exige uma **subscrição Strava ativa** do programador (API Policy 3.6), uma por app.
- Têm de vir capturas de **todos** os sítios onde a app mostra dados do Strava e do botão "Connect with Strava".

## Antes de submeter

1. Publicar a versão da app com o botão e o logótipo oficiais, o link "View on Strava" e o texto de consentimento (PR das
   regras de marca), e pôr no ar a secção 4 de https://telemesync.pereiragabriel.com/legal.html#strava (o revisor vai lê-la).
2. Confirmar em https://www.strava.com/settings/api: nome da aplicação, número de atletas ligados (deve estar em 10) e
   que o "Website" e a descrição batem certo com o abaixo.
3. Tirar as capturas no telemóvel, com uma atividade real (lista abaixo).

## Respostas ao formulário

| Campo | Resposta |
|---|---|
| First name / Last name / Email | Do titular (a resposta chega a este email; garantir que developers@strava.com não vai para spam). |
| Company Name | `telemeSYNC (independent developer)`, ou o nome legal do titular se não houver empresa. |
| API Application Name | O nome que aparece em strava.com/settings/api (esperado: `telemeSYNC`). |
| Strava Client ID | `291951` |
| Additional Apps | Nenhuma (o modo de desenvolvimento usa o mesmo client ID). |
| Number of Currently Authenticated Users | O número em strava.com/settings/api (esperado: `10`). |
| Number of Intended Users | Estimativa do titular. Referência: utilizadores do programa desktop na página /stats do site. |
| Support URL | `https://telemesync.pereiragabriel.com/` (contacto: hello@pereiragabriel.com, no aviso legal) |
| TOS Compliance / API Policy Compliance / Brand Guidelines Review | Marcar só depois de rever os três documentos (ver "Conformidade" abaixo). |
| App Images | As capturas da lista abaixo. |

### Application Description (colar em inglês)

> telemeSYNC is a free Android app (and a free desktop program) for cyclists who film their rides. It overlays the
> athlete's own ride telemetry (speed, heart rate, power, cadence, gradient, altitude, map and elevation profile) on a
> video they recorded with their phone or action camera, and exports a new video file to the phone. There are no ads,
> no accounts and no paid features.
>
> Use of the Strava API: as an alternative to importing a FIT/GPX file, the athlete can tap "Connect with Strava"
> (scopes `read,activity:read_all`, mobile OAuth). The app then lists the athlete's own activities around the video's
> recording time (GET /athlete/activities), and when the athlete picks one it reads that activity's streams
> (GET /activities/{id}/streams: time, latlng, altitude, velocity_smooth, distance, heartrate, cadence, watts, temp).
> That is the only data we read.
>
> Data handling: everything is processed on the athlete's phone, in memory, only while the app is open. No Strava data
> is stored on our servers or kept on the phone after the app closes, and it is never shown to other users, combined
> with other athletes' data, used for analytics or advertising, or used with AI/ML. To draw streets on the round
> map, the app requests OpenStreetMap tiles of the route's area from OpenFreeMap (only the tile area, never the activity). Our server only runs a small OAuth
> helper that keeps the client secret out of the app: it holds the tokens in memory for at most two minutes to hand them
> to the phone and logs nothing. Tokens are stored on the phone until the athlete taps "Disconnect", which also calls
> /oauth/deauthorize. We use `id_str` for activity and athlete IDs (ready for 64-bit IDs). Privacy policy (Strava
> section, in Portuguese and English): https://telemesync.pereiragabriel.com/legal.html#strava
>
> Brand guidelines: the official "Connect with Strava" button (orange, 48 px), the "Powered by Strava" logo in the
> activity list, a "View on Strava" link on every activity, and no Strava marks in the app name or icon.
>
> One point we would like to confirm with you: the exported video contains the athlete's own activity data drawn on
> their own footage. It is saved to the athlete's device, and the app offers the system share sheet for that file, so
> the athlete can post it (for example to Instagram or YouTube), much like sharing their own activity. The app never
> publishes anything by itself and never shows one athlete's data to another. If you consider that this needs changes
> under the API Policy (for example an attribution in the video, or limiting which data can be exported), we will
> implement them.
>
> We have reached the 10-athlete limit of the Standard Tier and would like more capacity for a public release.

## Capturas a tirar (App Images)

Todas no telemóvel, com a versão nova da app e uma atividade real:

1. Ecrã inicial antes de ligar: botão "Connect with Strava" e o texto de consentimento com o link "Privacidade".
2. A página de autorização do Strava aberta pela app (mostra o nome da app e as permissões).
3. A lista de atividades: nomes, datas, durações, distâncias, "View on Strava" e "Powered by Strava".
4. O ecrã inicial com a atividade escolhida (nome, horas, distância) e "Ligado como …" / "Desligar".
5. O editor, separador Gadgets: pré-visualização com velocidade, FC, mapa e perfil.
6. O editor, separador Sync: o mapa redondo com o trajeto e a linha do tempo.
7. O editor, separador Formato (se mostrar dados da atividade).
8. O ecrã de exportação e um frame do vídeo exportado.

## Conformidade (resumo da revisão de 2026-11-18)

- **Regras de marca**: botão oficial sem alterações, logótipo "Powered by Strava" oficial, "View on Strava" a laranja
  e sublinhado, "Strava" fora do nome e do ícone da app.
- **Consentimento antes do acesso** (Policy 2.1): texto ao lado do botão com os dados lidos, onde ficam e como
  desligar, e link para a política de privacidade.
- **Cache** (Policy 6.2, 5.7): dados só em memória; nada é guardado depois de fechar a app (dentro dos 7 dias).
- **Apagar ao desligar** (Policy 7.4): "Desligar" chama /oauth/deauthorize e apaga os tokens; não há mais nada guardado.
- **Gratuita, sem anúncios** (Policy 5.8, 5.9).
- **Sem IA nem agregação** (Policy 5.3, 5.4).
- **Ponto em aberto**: Policy 6.2 e 5.10 proíbem mostrar ou entregar dados do Strava a terceiros, "mesmo com o
  consentimento do utilizador". O vídeo exportado leva dados da atividade e o atleta pode partilhá-lo. A descrição acima
  expõe isto ao Strava e pergunta; se pedirem alterações, fazê-las antes de lançar.
