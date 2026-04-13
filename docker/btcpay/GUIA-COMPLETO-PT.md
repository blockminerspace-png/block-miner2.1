# Guia completo: BTCPay (Docker oficial) + Cloudflare + BlockMiner

Este documento explica **o que apontar no Cloudflare**, **por qual URL e porta acedes ao BTCPay**, e **o que meter no `.env` / secrets do BlockMiner**. O stack de Docker do BTCPay **não é inventado pelo BlockMiner**: usa o projeto oficial [btcpayserver-docker](https://github.com/btcpayserver/btcpayserver-docker) através do script `install-btcpay.sh` nesta pasta.

---

## 1. O que vais ter no fim

| Peça | Valor típico |
|------|----------------|
| **URL pública do BTCPay** | `https://pay.TEUDOMINIO.com` — porta **443** (padrão HTTPS; **não** precisas de `:443` no browser nem no `BTCPAY_URL`) |
| **URL da API do BlockMiner** (webhook) | `https://blockminer.space/api/payments/btcpay/webhook` (ou o domínio real da tua app) |
| **Onde corres o instalador** | Num servidor **Linux** (VPS) com Docker; idealmente **outra VPS** só para BTCPay (ver secção 6) |

---

## 2. Que subdomínio criar (Cloudflare / DNS)

Tens de escolher **um hostname só para o BTCPay**, que o mundo vai usar no browser.

**Exemplos válidos** (escolhe **um** e mantém coerência em todo o lado):

- `pay.blockminer.space`
- `btcpay.blockminer.space`
- `btc.blockminer.space`

Na zona DNS da Cloudflare (domínio `blockminer.space` ou outro):

### Registo **A** (obrigatório)

| Campo Cloudflare | Valor |
|------------------|--------|
| **Type** | `A` |
| **Name** | `pay` (se quiseres `pay.blockminer.space`; se quiseres nome completo noutro painel, ajusta) |
| **IPv4 address** | IP **público** da VPS onde vais correr o **Docker do BTCPay** (não o IP privado Docker interno) |
| **Proxy status** | **DNS only** (ícone de nuvem **cinzenta**) — **recomendado** na primeira instalação para o Let's Encrypt validar por HTTP na porta **80** sem a Cloudflare “engolir” o tráfego. |
| **TTL** | Auto |

**Porquê “DNS only” (cinzento)?**  
O instalador oficial expõe **Nginx** na máquina e pede certificado **Let's Encrypt** (normalmente desafio HTTP na porta 80). Com proxy **Proxied** (laranja), a Cloudflare termina TLS no edge e **muitas vezes o emissor de certificado na origem falha** ou ficas com configurações extra (certificado de origem, modo SSL “Full”, etc.). Para **primeira vida fácil**: cinzento no hostname do BTCPay. Depois de tudo estável, podes estudar laranja com cuidado.

### Registo **AAAA** (opcional)

Só se a tua VPS tiver **IPv6 público** e quiseres tráfego IPv6.

### Propagação

Espera o `pay.teudominio.com` resolver para o IP certo (`ping` ou `nslookup` de fora) **antes** de correres `install-btcpay.sh`.

---

## 3. Portas: o que abrir e o que **não** pões no `.env`

### Na firewall da VPS (e no painel do hosting)

| Porta | Protocolo | Para quê |
|-------|-----------|----------|
| **80** | TCP | Let's Encrypt (HTTP-01) + redirecionamento para HTTPS |
| **443** | TCP | Interface web do BTCPay + API Greenfield em HTTPS |

**Não** coloques `https://pay.teudominio.com:443` no `BTCPAY_URL` — a porta 443 é implícita. Só usarias porta no URL se mudasses **de propósito** o HTTPS para outra (avançado; não é o caso do instalador padrão).

Se no futuro ativares **Lightning** exposto à internet, o upstream fala em **9735** TCP — só relevante se configurares LN no `env` do BTCPay.

---

## 4. Onde acedes ao painel do BTCPay (domínio e “porta”)

- **No browser:** `https://BTCPAY_HOST`  
  Exemplo: `https://pay.blockminer.space`  
- **“Porta”:** é **443** por defeito; **não** escrevas na barra de endereço a não ser que saibas o que estás a fazer.

É **esse mesmo** URL base (sem path, sem barra final) que vais repetir no BlockMiner como `BTCPAY_URL`.

---

## 5. Ficheiros no servidor do BTCPay (antes do `install-btcpay.sh`)

No repositório BlockMiner (ou cópia na VPS):

1. Copia o modelo:  
   `cp docker/btcpay/env.example docker/btcpay/env`
2. Edita `docker/btcpay/env`:
   - **`BTCPAY_HOST`** = **exatamente** o hostname público (ex.: `pay.blockminer.space`) — tem de bater certo com o DNS.
   - **`LETSENCRYPT_EMAIL`** = email válido (avisos de expiração de certificado).
   - **`NBITCOIN_NETWORK`**: `testnet` para testes mais rápidos; `mainnet` para dinheiro real (sync longo e mais disco).

3. Na VPS, **como root**:  
   `bash docker/btcpay/install-btcpay.sh`

O script clona o **btcpayserver-docker** oficial e corre **`. ./btcpay-setup.sh -i`**, que instala Docker se preciso, gera o `docker-compose` certo e sobe os contentores.

---

## 6. Muito importante: mesma VPS que o BlockMiner ou VPS à parte?

### Opção recomendada: **VPS separada** só para BTCPay

- O teu BlockMiner em produção já usa **Nginx** nas portas **80/443** (ex.: `block-miner-nginx`).
- O stack oficial do BTCPay **também** quer **Nginx** a ouvir **80/443** nessa máquina.
- **Na mesma VPS os dois a competir por 80/443 = conflito** (a não ser que sejas perito a fundir proxies e portas — fora do escopo deste guia “certinho”).

**Conclusão:** para não dar merda, mete o BTCPay numa **VPS com IP próprio** e aponta o subdomínio **A** para **esse** IP.

### Se insistires na mesma máquina

Tens de **mudar portas** do reverse proxy de um dos dois (variáveis `REVERSEPROXY_HTTP_PORT` / `REVERSEPROXY_HTTPS_PORT` no fluxo upstream) **ou** um único Nginx na frente a encaminhar por hostname — é arquitetura avançada; **não** é o caminho “copiar e colar” deste guia.

---

## 7. `.env` / secrets do **BlockMiner** (app da API — não confundir com `docker/btcpay/env`)

Estas variáveis vão no **servidor onde corre a API BlockMiner** (ex.: `deploy.secrets.local` que o teu `deploy.py` faz merge, ou `.env` da VM **da app**, não o ficheiro `docker/btcpay/env` do instalador BTCPay).

| Variável | Exemplo | Notas |
|----------|---------|--------|
| `BTCPAY_URL` | `https://pay.blockminer.space` | **Sem** barra final. **Sem** porta (443 implícito). Tem de ser o mesmo host que abres no browser. |
| `BTCPAY_API_KEY` | `token copiado do BTCPay` | Greenfield / Access token com permissão para **criar e ver invoices**. |
| `BTCPAY_STORE_ID` | `id da loja` | No BTCPay: Store → definições / General → Store ID. |
| `BTCPAY_WEBHOOK_SECRET` | `segredo da entrega webhook` | Store → Webhooks → criar webhook para a URL abaixo → copiar **signing secret**. |

**Webhook URL** a registar no BTCPay (corpo do BlockMiner):

`https://blockminer.space/api/payments/btcpay/webhook`

(Substitui pelo domínio real da tua API se não for esse.)

**Evento:** inclui notificação quando a fatura está **liquidada / settled** (nome exacto depende da versão da UI; no código esperamos o fluxo **InvoiceSettled** após pagamento confirmado.)

Depois de gravares estes valores no sítio certo, **reinicia / redeploy** a app BlockMiner para carregar o `.env`.

---

## 8. Onde clicar no BTCPay para obter Store ID, API key e webhook

1. **Primeiro login:** `https://BTCPAY_HOST` → criar conta administrador.
2. **Criar Store** (Loja) se o assistente não tiver criado.
3. **Store ID:** Store → **Settings** / **Geral** → identificador da loja.
4. **API Key (Greenfield):** **Account** / **Access Tokens** (ou caminho equivalente na tua versão) → criar token com scopes de **invoice** (criar + consultar).
5. **Webhook:** Store → **Webhooks** → New → URL = `https://blockminer.space/api/payments/btcpay/webhook` → escolher evento de **invoice settled** → guardar e copiar o **secret** para `BTCPAY_WEBHOOK_SECRET`.

---

## 9. Checklist rápido (ordem certa)

1. [ ] Subdomínio escolhido (ex.: `pay.blockminer.space`).
2. [ ] Cloudflare: registo **A** → IP da **VPS do BTCPay**; **DNS only** (recomendado).
3. [ ] Portas **80** e **443** abertas nessa VPS.
4. [ ] `docker/btcpay/env` preenchido; `BTCPAY_HOST` = hostname exacto.
5. [ ] `sudo bash docker/btcpay/install-btcpay.sh` concluído sem erro.
6. [ ] Browser: `https://BTCPAY_HOST` abre o BTCPay.
7. [ ] Store + API key + webhook criados.
8. [ ] BlockMiner: `BTCPAY_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`, `BTCPAY_WEBHOOK_SECRET` definidos e app redeployada.
9. [ ] Na Wallet do jogo aparece opção Bitcoin (BTCPay) quando as quatro variáveis estão presentes.

---

## 10. Erros comuns

| Sintoma | Causa provável |
|---------|----------------|
| Let’s Encrypt falha | DNS ainda não aponta para o IP certo; ou **proxy laranja** a bloquear HTTP-80 na origem; ou 80/443 fechados na firewall. |
| `https://pay...` não abre | Instalação não terminou; contentores em baixo; firewall; hostname errado no `BTCPAY_HOST`. |
| BlockMiner não mostra BTCPay | Falta alguma das **quatro** variáveis `BTCPAY_*` na **API**; ou URL errada; ou não fizeste redeploy. |
| Webhook 401 | `BTCPAY_WEBHOOK_SECRET` não coincide com o secret da entrega no BTCPay. |

---

## Referências oficiais

- [BTCPay Docker](https://docs.btcpayserver.org/Docker/)
- Repositório: [btcpayserver/btcpayserver-docker](https://github.com/btcpayserver/btcpayserver-docker)

Ficheiros neste repo relacionados: `docker/btcpay/env.example`, `docker/btcpay/install-btcpay.sh`, `LEIAME-PT.txt`, `.env.example` (secção BTCPAY da app).
