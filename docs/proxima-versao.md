# Próxima versão (por lançar)

Correções e novidades já no código (branch `claude/quirky-davinci-86dfhm`), à espera do próximo lançamento. Ao lançar,
passar para **Novidades** em `site/index.html` (com `data-i18n="news.<versão>.<n>"` e as traduções em `site/i18n/*.json`)
e apagar daqui.

## Changelog

- **W/kg na potência:** ao escolher um gadget de potência aparece a caixa "Potência" no passo 4, onde se pode ligar
  "Mostrar também W/kg" e indicar o peso (em kg, ou em lb com unidades imperiais). O gadget de potência passa a ter
  duas linhas, os watts em grande e os W/kg mais pequenos por baixo; nos mostradores, nos de Natal e no painel de
  potência os W/kg aparecem junto à unidade. Nos segmentos e voltas, o gadget em direto e a tabela de voltas mostram
  também o W/kg médio.
- **Potência instantânea ou média de 3 segundos:** na mesma caixa escolhe-se a potência mostrada: a leitura
  instantânea ou a média dos últimos 3 segundos, como nos ciclocomputadores (mais estável, sem saltos). A média não
  atravessa pausas.
- **Definições onde são precisas:** o FTP passa para a caixa "Potência" e as zonas de frequência cardíaca para uma
  caixa "Frequência cardíaca", que só aparecem quando se escolhe um gadget dessa métrica. As zonas de FC podem ser
  calculadas a partir da FC máxima (60, 70, 80 e 90 %) e cada limite acerta-se num campo próprio. Quando um gadget usa
  zonas e o FTP ou as zonas ainda estão nos valores predefinidos, a app avisa para indicar os seus. Os números escritos
  nos campos ficam mais legíveis.
- **Os gadgets escolhidos ficam guardados:** a app passa a lembrar-se dos gadgets selecionados e do modo de exportação
  (gadgets separados, composição e resolução) para a volta seguinte, como já fazia com as cores, as posições e as
  outras definições. Um gadget que uma volta não pode mostrar (ex.: potência sem medidor) volta a aparecer escolhido
  na volta seguinte que o tenha.
- **Zonas das redes sociais:** na pré-visualização do passo 3, botões para TikTok, Instagram Reels e YouTube Shorts
  (podem ligar-se vários ao mesmo tempo) escurecem as zonas onde cada app põe o nome, a descrição e os botões de
  gostos e partilha. Escuro: tapado pela app; claro: pode ficar tapado (descrição longa, anúncios). Os gadgets que
  ficam por baixo ganham um contorno vermelho (amarelo nas zonas que podem ficar tapadas) e uma linha diz quantos são.
  A camada é só de ajuda: não aparece nos ficheiros exportados.
