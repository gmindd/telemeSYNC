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
