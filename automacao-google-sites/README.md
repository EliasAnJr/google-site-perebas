# Automacao Google Sites (Planilha + Apps Script)

Este pacote gera automaticamente:
- classificacao individual
- desempenho dos times
- resultados por jogo com pontuacao de cada jogador presente

Regras implementadas:
- vitoria: +3
- empate: +1
- derrota: 0
- jogador ausente em jogo vencido: nao pontua
- bonus +1 para 100% de presenca no mes

## 1) Estrutura da planilha

Crie uma planilha Google com 3 abas:
- `Jogadores`
- `Jogos`
- `Presencas`

Voce pode rodar `setupModeloPerebas()` para criar tudo automaticamente.

### Aba `Jogadores`
Colunas:
- A: `Nome`
- B: `Time` (`Laranja` ou `Preto`)
- C: `Ativo` (`TRUE` ou `FALSE`)
- D: `Alias (opcional, separado por virgula)`

Exemplo de alias util:
- `Cleberson` com alias `Cleber`
- `Henrique` com alias `Henirque`

### Aba `Jogos`
Colunas:
- A: `Data` (data real do Google Sheets)
- B: `Gols Laranja`
- C: `Gols Preto`

### Aba `Presencas`
Colunas:
- A: `Data`
- B: `Jogador`

Use 1 linha por jogador presente em cada jogo.

## 2) Instalar no Apps Script

1. Abra a planilha
2. `Extensoes > Apps Script`
3. No projeto, crie/cole:
- arquivo `Code.gs` (conteudo deste pacote)
- arquivo `Index.html` (conteudo deste pacote)

Se o projeto nao for vinculado a planilha:
- preencha `SPREADSHEET_ID` no inicio do `Code.gs`

## 3) Primeira carga

No editor Apps Script:
1. Execute `setupModeloPerebas()`
2. Execute `popularJogadoresPadraoPerebas()` (opcional)
3. Execute `popularExemploFevereiro2026()` (opcional, para teste)

## 4) Publicar Web App

1. `Implantar > Nova implantacao`
2. Tipo: `Aplicativo da web`
3. Executar como: `Voce`
4. Quem tem acesso: `Qualquer pessoa com o link` (ou conforme sua necessidade)
5. Copie a URL publicada

## 5) Incorporar no Google Sites

No Google Sites:
1. `Inserir > Incorporar > URL`
2. Cole a URL do Web App

Parametros opcionais:
- `?year=2026&month=2`

Exemplo:
- `https://script.google.com/.../exec?year=2026&month=2`

## 6) Rotina de uso

1. Preencha `Jogos` e `Presencas`
2. Atualize a pagina do Sites
3. A classificacao e resultados sao recalculados automaticamente

## 7) Qualidade dos inputs (recomendado)

- Use validacao de dados para nomes em `Presencas`
- Mantenha alias para nomes com variacao
- Rode `mostrarValidacaoMesAtual()` para detectar inconsistencias
