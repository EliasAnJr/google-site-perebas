# Modelo Mensal de Atualizacao - Artilharia (Perebas FC)

## Como usar
1. Copie este modelo para o mes novo.
2. Preencha um bloco por jogo com os gols por jogador.
3. Valide a soma dos gols por time antes de atualizar a pagina.
4. Atualize o arquivo pagina-home/artilharia.
5. Rode o checklist final antes de publicar.

## 1) Estrutura recomendada da base de dados (.txt)
Arquivo sugerido:
- paginas-<mes>/Artilharia-do-ciclo-<mes>.txt

Formato sugerido (padrao fixo para facilitar manutencao e automacao futura):

~~~txt
ARTILHARIA DO CICLO - MES DE <MES>

Jogo do dia DD/MM/AAAA

PLACAR OFICIAL:
TIME PRETO: N GOLS
TIME LARANJA: N GOLS

GOLS TIME PRETO:
1- Nome Jogador: N
2- Nome Jogador: N
...

GOLS TIME LARANJA:
1- Nome Jogador: N
2- Nome Jogador: N
...

GOLS NAO CREDITADOS (opcional):
A FAVOR DO TIME PRETO: N
A FAVOR DO TIME LARANJA: N
MOTIVO: contra | sem identificacao | misto

CONFERENCIA:
SOMA TIME PRETO: N
SOMA TIME LARANJA: N
STATUS: OK | AJUSTAR

#######################################################
~~~

## 2) Regras de preenchimento (importante)
- Preencha sempre um bloco completo por jogo.
- Em GOLS TIME PRETO e GOLS TIME LARANJA, use apenas inteiros.
- Se um jogador nao marcou, nao incluir esse jogador na lista de gols.
- Se houver gol sem autoria confirmada, usar GOLS NAO CREDITADOS.
- STATUS deve ficar como OK somente quando as somas baterem com o placar oficial.

## 3) Exemplo pratico preenchido
~~~txt
ARTILHARIA DO CICLO - MES DE MARCO

Jogo do dia 14/03/2026

PLACAR OFICIAL:
TIME PRETO: 10 GOLS
TIME LARANJA: 6 GOLS

GOLS TIME PRETO:
1- Everton: 3
2- Jean: 2
3- Cleberson: 2
4- Chico: 1
5- Elias: 1
6- Leone: 1

GOLS TIME LARANJA:
1- Tacio: 2
2- Daniel: 2
3- Henrique: 1
4- Alex: 1

GOLS NAO CREDITADOS (opcional):
A FAVOR DO TIME PRETO: 0
A FAVOR DO TIME LARANJA: 0
MOTIVO: sem identificacao

CONFERENCIA:
SOMA TIME PRETO: 10
SOMA TIME LARANJA: 6
STATUS: OK

#######################################################
~~~

## 4) Como atualizar a pagina-home/artilharia
Arquivo alvo:
- pagina-home/artilharia

Fluxo recomendado:
1. Somar os gols de cada jogador no mes inteiro.
2. Atualizar a tabela principal da artilharia.
3. Ordenar por gols totais (decrescente).
4. Em caso de empate, ordenar por nome (ascendente) para manter previsivel.
5. Atualizar chips do topo (exemplo: Rodadas, Jogadores com gol, Total de gols).

## 5) Mini tabela auxiliar para fechar as contas antes do HTML
~~~txt
Jogador   | Gols no jogo | Gols acumulados
Everton   | 3            | 7
Jean      | 2            | 6
Cleberson | 2            | 5
...
~~~

Dica:
- Guarde esta mini tabela no final do arquivo da base ou em rascunho separado.
- Isso reduz erro manual ao atualizar a pagina-home/artilharia.

## 6) Checklist final de artilharia
- [ ] Bloco do jogo preenchido na base .txt
- [ ] Soma dos gols bate com o placar oficial
- [ ] Gols nao creditados registrados (quando houver)
- [ ] Tabela da pagina-home/artilharia atualizada
- [ ] Ranking ordenado corretamente
- [ ] Chips de resumo atualizados
- [ ] Revisao visual concluida

## 7) Padrao de nomes (obrigatorio)
Para evitar duplicidade no ranking de artilharia:
- Use sempre o mesmo nome para o mesmo jogador.
- Evite alternar versoes com e sem acento no mesmo mes.
- Se vier nome diferente no dia do jogo, normalizar para o nome canonico antes de salvar.

Exemplo de padrao canonico:
- Rogerio
- Tacio
- Alemao

## 8) Observacao para automacao futura
Esse formato foi pensado para ser parseado por script sem ambiguidade:
- cabecalhos fixos
- separador fixo de blocos
- gols por jogador no formato Nome: N
- conferencia explicita por time
