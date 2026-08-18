# GCB Simulador

App local para gerar PDFs de "Carteira Simulada" (Renda Mensal / Crescimento de Patrimônio) com dados de mercado buscados automaticamente, ao vivo, de fontes oficiais:

- **BACEN** (API SGS + OLINDA/Focus) — CDI, IPCA, projeções de mercado
- **ANBIMA** (curva ETTJ) — taxas de referência para ativos CDI+ e IPCA+

Dados são cacheados por 1 dia (`cache/`) — só busca de novo se o cache do dia não existir.

## Como rodar

```
cd "GCB-Simulador-App"
npm install
npm start
```

Depois abra **http://localhost:4321** no navegador.

## Como usar

1. Preencha cliente, data-base e escolha o modelo (Renda Mensal ou Crescimento de Patrimônio).
2. Adicione os ativos da carteira (nome, tipo, indexador, taxa, valor investido, vencimento, se é isento de IR e se paga cupom mensal — e se os juros devem ser reinvestidos).
3. Clique em "Gerar PDF" — o app busca a curva ANBIMA e as premissas BACEN do dia, calcula tudo e gera o PDF no padrão visual GCB (v3: comparativo com CDI, donut 6 cores, tabela ampliada, gráfico centralizado).
4. Baixe o PDF pelo link que aparece na tela. Os arquivos também ficam salvos em `output/`.

## Estrutura

- `lib/bacen.js` — integração BACEN (CDI, IPCA, Focus)
- `lib/anbima.js` — integração curva ETTJ ANBIMA (feeds XML públicos da página CZ.asp)
- `lib/calculo.js` — motor de cálculo (interpolação, IR regressivo, Valor Futuro Caso A/B)
- `lib/report.js` + `lib/svgCharts.js` — geração do HTML de 4 páginas (donut, tabela, gráfico de barras)
- `lib/pdf.js` — conversão HTML → PDF via Microsoft Edge headless
- `server.js` + `public/` — servidor Express e formulário web

## Observações

- Precisa do **Microsoft Edge** instalado (usa `msedge.exe --headless --print-to-pdf`).
- Se a ANBIMA mudar o layout da página CZ.asp, o parser em `lib/anbima.js` pode quebrar — nesse caso, os erros aparecem no log do servidor.
- A metodologia de cálculo é a mesma validada manualmente nas simulações de Reynaldo e Leonardo (ver `Materiais Produtos/Template_Carteira_*.md`).
