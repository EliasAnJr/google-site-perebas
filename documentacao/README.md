# Guia de Atualizacao de Resultados e Classificacao (Perebas FC)

## Objetivo
Este documento descreve um processo simples para atualizar:
- a pagina de resultados do mes
- a classificacao individual na pagina home

A ideia e evitar inconsistencias entre resultado do jogo, pontuacao dos jogadores e desempenho dos times.

## Modelo mensal reutilizavel
Para acelerar as proximas atualizacoes, use o modelo:
- documentacao/MODELO-MENSAL-ATUALIZACAO.md
- documentacao/MODELO-MENSAL-ARTILHARIA.md

Fluxo sugerido:
1. Preencher o modelo com os dados do novo jogo.
2. Aplicar os dados em paginas-<mes>/resultados.
3. Aplicar os incrementos em pagina-home/classificacao-jogadores.
4. Validar com o checklist final.

## Automacao por script
Script implementado:
- scripts/atualizar-classificacao.js

Comandos:
- Preview (nao altera arquivos):
  node scripts/atualizar-classificacao.js --mes marco --data 14/03/2026 --modo preview
- Apply (grava alteracoes e cria backup .bak):
  node scripts/atualizar-classificacao.js --mes marco --data 14/03/2026 --modo apply
- Atalho na raiz do projeto (equivalente ao comando acima):
  node .\atualizar-classificacao.js --mes marco --data 14/03/2026 --modo preview
- Se voce estiver dentro da pasta scripts, rode:
  node .\atualizar-classificacao.js --mes marco --data 14/03/2026 --modo preview

Parametros principais:
- --mes: define a pasta do mes (exemplo: marco)
- --data: define a data do jogo (DD/MM/AAAA). Se nao informar, pega o ultimo jogo da base.
- --modo: preview ou apply
- --forcar: permite aplicar mesmo se a data ja existir em resultados

Comportamento de seguranca:
- Se a data ja existir em paginas-<mes>/resultados, o apply e bloqueado por padrao para evitar duplicidade.
- Use --forcar somente quando souber exatamente o que esta fazendo.

## Arquivos principais
- paginas-marco/Jogos-do-ciclo-*.txt (base de dados dos jogos do mes)
- paginas-marco/resultados (pagina visual dos resultados do mes)
- pagina-home/classificacao-jogadores (ranking geral e tabela dos times)

Observacao:
Use sempre o arquivo de base do mes corrente dentro da pasta paginas-marco (ou da pasta do mes correspondente).

## Regras aplicadas na classificacao
- Vitoria: +3 pontos
- Empate: +1 ponto
- Derrota: 0 ponto
- Jogador ausente no jogo: nao soma V, E, D e nao recebe pontos da rodada
- Jogador faltou, mas o time dele venceu: nao recebe os 3 pontos
- Bonus de 100% de presenca no mes: +1 ponto

## Fluxo recomendado a cada novo jogo
1. Atualizar a base de dados (arquivo de jogos do mes) com:
- data do jogo
- placar
- time vencedor (ou empate)
- lista de presentes e ausentes
- jogadores do time vencedor e do time derrotado

2. Atualizar paginas-marco/resultados:
- adicionar um novo bloco section com classe match
- preencher data, placar e vencedor
- listar jogadores do vencedor com +3 pontos
- listar jogadores do derrotado com 0 ponto
- se houver empate, marcar como empate e refletir isso na classificacao
- manter a separacao visual entre jogos usando a regra CSS .match + .match

3. Atualizar pagina-home/classificacao-jogadores:
- aumentar o numero de Rodadas nos chips
- recalcular cada jogador (Pontos, V, E, D, Bonus)
- reordenar a tabela por maior pontuacao
- atualizar o bloco Desempenho dos Times (chips e tabela)

4. Validar consistencia final:
- soma de resultados dos jogadores bate com o jogo informado
- V, E, D de cada jogador estao corretos para quem jogou
- bonus de 100% de presenca esta correto
- total de jogos dos times (J) e aproveitamento estao corretos

## Formula rapida para desempenho dos times
- Pontos do time = (V x 3) + (E x 1)
- Aproveitamento (%) = Pontos / (J x 3) x 100

Sugestao de exibicao:
- usar 1 casa decimal no aproveitamento (exemplo: 55.6%)

## Armadilha conhecida: regex de cabecalho de jogo no parser

### Problema
A funcao `parseGames` no script precisa localizar o inicio de cada bloco de jogo no arquivo .txt
usando uma expressao regular que identifica linhas como:

```
Jogo do dia 14/03/2026
```

Porem, o mesmo arquivo .txt tambem contem linhas internas nos blocos, como:

```
JOGADORES DO TIME PRETO NO Jogo do dia 14/03/2026
```

Se a regex **nao tiver ancoras de linha** (^ e $), ela captura essas linhas internas tambem,
criando blocos fantasmas com listas de jogadores vazias. O resultado visivel e o erro:

```
Nao foi possivel extrair jogadores do jogo selecionado na base.
```

### Solucao
Sempre usar a regex com ancoras de inicio (^) e fim ($) de linha, com a flag `m` (multiline):

```javascript
// CORRETO - ancorado ao inicio e fim da linha
/^\s*Jogo do dia\s+(\d{2}\/\d{2}\/\d{4})\s*$/gim

// ERRADO - sem ancoras, captura linhas internas tambem
/Jogo do dia\s+(\d{2}\/\d{2}\/\d{4})/gi
```

A flag `m` faz com que `^` e `$` correspondam ao inicio e ao fim de cada linha do texto,
e nao ao inicio/fim do documento inteiro.

---

## Padrao de nomes (importante)
Para evitar duplicidade no ranking, manter sempre o mesmo nome na classificacao.
Exemplo:
- usar Rogerio (nao alternar com outras variacoes de escrita)
- usar Tacio (nao alternar com outras variacoes de escrita)
- usar Alemao (nao alternar com outras variacoes de escrita)

Se o resultado do jogo vier com acento, converter para o nome padrao usado na tabela de classificacao.

## Checklist de atualizacao
- Rodada nova adicionada em resultados
- Rodadas atualizadas na classificacao
- Jogadores vencedores com +3 na rodada
- Jogadores derrotados com 0 na rodada
- Ausentes sem alteracao de V/E/D/pontos
- Bonus 100% revisado
- Tabela dos times atualizada (J, pontos, V, E, D, aproveitamento)
- Conferencia visual final da pagina

## Exemplo pratico (jogo 14/03/2026)
- Resultado: Time Preto 10 x 6 Time Laranja
- Vencedor: Time Preto
- Jogadores do Preto no jogo: Everton, Domingos, Cleberson, Jean, Chico, Elias, Leone
- Jogadores do Laranja no jogo: Tacio, Henrique, Alex, Daniel

Impacto direto:
- jogadores do Preto presentes: +3 e +1 em V
- jogadores do Laranja presentes: +1 em D e 0 ponto
- chips e tabela de times ajustados para refletir a nova rodada
