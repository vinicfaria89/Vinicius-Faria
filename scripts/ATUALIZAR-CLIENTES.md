# Atualização mensal da base de clientes (Pipedrive)

O app não tem token do Pipedrive. A base (`data/clientes.json`, fora do Git) é atualizada **todo dia 5** pelo
Claude, usando o conector do Pipedrive, e importada com `scripts/importar-clientes.js`.

## Procedimento

1. Chamar `getPersons` do conector do Pipedrive, em páginas, até `next_cursor` vir nulo:
   - `limit: 500`, `sort_by: "id"`, `sort_direction: "asc"`, `include_option_labels: true`
   - `custom_fields` (11 chaves):
     `e4c5c0308087fefaccbe67dcd8ab1cb9de586eca` (Status do Cliente),
     `1d241b892c31ef6438cd53f2c1bce9920cd6a777` (Valor total em custódia),
     `fa11210f588bd82dea625e757f9179385fb01e5c` (Valor em saldo disponível),
     `42f3b05289472e04f8e080ea2bcbf65bb911f961` (Valor total comprado),
     `6c305d24f518ae96b61b215d4074c30cac644a28` (Renda Declarada),
     `2ffeb14fa686a7fde55dd7fc2cef9710a8e0ed3c` (SOW R$),
     `2032fe756a13a55ab8a2337cba3349f37938c5b7` (SOW %),
     `16f9fa48dac0a1c6fe682dfc0aacc874f7668644` (Data Último Investimento),
     `bffe6fec3fe047973c1e113b308ecb12b72e9467` (BU),
     `a6bc40f95aab82832afa6dade534737cbfc926be` (Sub-segmento),
     `597462ace08144f0c371e3ace2088c1aa6fcb0f8` (Data Último Contato Efetivo)
   - As respostas grandes são salvas pelo conector em arquivos (`tool-results\...getPersons-*.txt`, JSON).
     Copie cada uma, em ordem, para uma pasta NOVA e vazia (ex.: `...\scratchpad\pd-AAAA-MM\p001.json`, `p002.json`…).
     A cada página, o próximo `cursor` vem em `additional_data.next_cursor`.
2. Na pasta do projeto: `node scripts/importar-clientes.js <pasta-das-paginas>`.
   - O script recusa a lista nova se ela for menos de 80% da atual (coleta incompleta) e não altera nada nesse caso.
   - Gera `data/clientes.json` e `data/clientes-mudancas.json` (novos, removidos, mudança de status).
3. Conferir a saída (`Clientes: antes -> depois | novos | removidos | status alterado`) e avisar o resultado.

Só leitura no Pipedrive: nada é gravado lá. Documento (CPF) e data de nascimento não são copiados.
O app avisa na tela quando a base passa de 35 dias sem atualização.
