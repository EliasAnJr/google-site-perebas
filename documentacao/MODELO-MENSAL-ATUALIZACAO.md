# Modelo Mensal de Atualizacao (Perebas FC)

## Como usar
1. Copie este modelo para o mes novo.
2. Preencha os dados de cada jogo.
3. Atualize a pagina de resultados do mes.
4. Atualize a classificacao na pagina home.
5. Rode o checklist final antes de publicar.

## 1) Dados base do mes (arquivo .txt)
Use esta estrutura no arquivo de jogos do mes:

```txt
LISTA COM TODOS JOGADORES DA PATOTA:
- Nome 1
- Nome 2
...

------------------------

TIMES FIXO MES DE <MES>

TIME PRETO
- Jogador A
- Jogador B
...

TIME LARANJA
- Jogador X
- Jogador Y
...

------------------------

JOGOS E DATAS:

Jogo do dia DD/MM/AAAA

Presentes:
1- Nome
2- Nome
...

Ausentes:
1- Nome
2- Nome
...

--------------------
RESULTADO do dia DD/MM/AAAA:

TIME PRETO: N GOLS
TIME LARANJA: N GOLS
TIME VENCEDOR = TIME PRETO | TIME LARANJA | EMPATE

-------------------

JOGADORES DO TIME PRETO NO Jogo do dia DD/MM/AAAA
Nome + 3 PONTOS
Nome + 3 PONTOS
...

JOGADORES DO TIME LARANJA NO Jogo do dia DD/MM/AAAA
Nome
Nome
...

#######################################################
```

Observacao para empate:
- Se houver empate, ajuste a secao de jogadores para refletir +1 para quem jogou.

## 2) Atualizacao da pagina de resultados do mes
Arquivo alvo: paginas-<mes>/resultados

Para cada jogo novo, adicionar um bloco:
- section com classe match
- h2 com data do jogo
- placar (Time Preto x Time Laranja)
- vencedor (ou empate)
- lista de jogadores com pontos

Padrao visual a manter:
- usar a regra CSS .match + .match para linha separadora entre jogos

Exemplo de separador:

```css
.match + .match{
  margin-top:18px;
  padding-top:18px;
  border-top:1px solid rgba(255,255,255,.14);
}
```

## 3) Atualizacao da classificacao individual
Arquivo alvo: pagina-home/classificacao-jogadores

### Regras de pontuacao
- Vitoria: +3
- Empate: +1
- Derrota: 0
- Ausente: nao soma V/E/D e nao ganha pontos da rodada
- Bonus 100% presenca no mes: +1

### Processo de incremento por jogo
1. Identificar quem jogou no jogo (presentes).
2. Para cada jogador presente:
- se venceu: Pontos +3 e V +1
- se empatou: Pontos +1 e E +1
- se perdeu: Pontos +0 e D +1
3. Para ausentes: nao alterar V/E/D/Pontos.
4. Recalcular bonus de 100% de presenca.
5. Reordenar ranking por Pontos (decrescente).

## 4) Atualizacao do bloco de times
No mesmo arquivo de classificacao:
- incrementar J (jogos) dos times
- atualizar V, E, D e Pontos dos times
- recalcular aproveitamento

Formulas:
- Pontos time = (V x 3) + (E x 1)
- Aproveitamento (%) = Pontos / (J x 3) x 100

## 5) Tabela auxiliar para calcular antes de editar HTML
Use esta mini planilha manual:

```txt
Jogador | Delta Pontos | Delta V | Delta E | Delta D | Jogou?
Nome    | +3           | +1      | 0       | 0       | Sim
Nome    | 0            | 0       | 0       | +1      | Sim
Nome    | 0            | 0       | 0       | 0       | Nao
```

## 6) Checklist final
- [ ] Rodada adicionada em paginas-<mes>/resultados
- [ ] Rodadas atualizadas na classificacao
- [ ] Ranking individual reordenado
- [ ] Bonus 100% revisado
- [ ] Chips e tabela de desempenho dos times atualizados
- [ ] Aproveitamento recalculado
- [ ] Conferencia visual final concluida

## 7) Padrao de nomes
Para evitar duplicidade de jogador, usar sempre o mesmo nome em todos os arquivos.
Se vier variacao de escrita no resultado do jogo, normalizar antes de atualizar a classificacao.

## 8) Execucao com script (opcional)
Script:
- scripts/atualizar-classificacao.js

Passo a passo recomendado:
1. Atualize o arquivo base do mes com o novo jogo.
2. Rode preview para conferir calculos sem gravar:
   node scripts/atualizar-classificacao.js --mes marco --data DD/MM/AAAA --modo preview
3. Se estiver tudo certo, rode apply:
   node scripts/atualizar-classificacao.js --mes marco --data DD/MM/AAAA --modo apply
4. Revise visualmente paginas-<mes>/resultados e pagina-home/classificacao-jogadores.

Nota:
- O script bloqueia apply se a data ja existir em resultados (protecao anti-duplicidade).
- Use --forcar apenas em casos de manutencao intencional.
