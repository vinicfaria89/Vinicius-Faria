# Deploy do GCB Simulador (uso compartilhado pelo time)

Este app agora está pronto pra rodar em qualquer servidor Linux/Docker, não só na sua máquina
Windows. O que mudou:

- **Geração de PDF**: antes usava o Microsoft Edge do Windows (`lib/pdf.js`); agora usa
  [Puppeteer](https://pptr.dev/), que baixa seu próprio Chromium e funciona em qualquer sistema.
- **Login opcional**: se as variáveis de ambiente `BASIC_AUTH_USER` e `BASIC_AUTH_PASS` estiverem
  definidas, o app pede usuário/senha (HTTP Basic) antes de liberar qualquer acesso — assim só o
  time consegue usar, não qualquer pessoa que tenha o link.
- **Cópia local pra pasta "Simulação"**: continua acontecendo só quando `NODE_ENV` não é
  `production` (ou seja, só no seu uso local — em produção esse passo é pulado).

## Passo 1 — escolher onde hospedar

Qualquer opção que rode containers Docker funciona, porque já existe um `Dockerfile` pronto na
raiz do projeto. Duas opções simples pra começar (ambas têm plano gratuito/baixo custo pra uso
interno pequeno):

- **[Render](https://render.com)** — cria um "Web Service", aponta pro `Dockerfile`, define as
  variáveis de ambiente na aba "Environment" e pronto. Interface mais simples.
- **[Railway](https://railway.app)** — parecido, também detecta o `Dockerfile` automaticamente.

Se a GCB já tiver um servidor/VPS próprio (ou Azure/AWS), qualquer um deles roda Docker também —
é só instalar o Docker lá e seguir o Passo 3.

## Passo 2 — variáveis de ambiente

No painel do serviço escolhido, defina (veja `.env.example` pra referência):

| Variável | Valor sugerido | Pra quê serve |
|---|---|---|
| `PORT` | `4321` (ou o que a plataforma exigir) | Porta que o servidor escuta |
| `BASIC_AUTH_USER` | ex.: `gcb` | Usuário do login compartilhado |
| `BASIC_AUTH_PASS` | uma senha forte, só do time | Senha do login compartilhado |
| `NODE_ENV` | `production` | Desativa a cópia local pra pasta OneDrive |

**Sem `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` definidos, o app fica aberto pra qualquer um com o
link** — recomendo sempre definir os dois em produção.

## Passo 3 — build e rodar (Docker, localmente ou em qualquer VPS)

```bash
docker build -t gcb-simulador .
docker run -p 4321:4321 -e BASIC_AUTH_USER=gcb -e BASIC_AUTH_PASS=suaSenha -e NODE_ENV=production gcb-simulador
```

Depois é só acessar `http://<endereço-do-servidor>:4321` — vai pedir usuário/senha antes de
mostrar o formulário.

## O que NÃO muda

- Os dados (ANBIMA, B3, BACEN) continuam sendo buscados ao vivo pela internet — o servidor
  hospedado precisa ter saída de internet liberada pra esses domínios.
- O formulário, os cálculos e o layout dos PDFs são exatamente os mesmos usados localmente — só a
  forma de gerar o PDF (Puppeteer em vez do Edge) e o acesso (com login) mudaram.

## Testando localmente antes de subir

```bash
npm install
npm start
```

Sem definir `BASIC_AUTH_USER`/`BASIC_AUTH_PASS`, continua funcionando sem login, exatamente como
antes — a mudança só entra em ação quando essas variáveis existem.
