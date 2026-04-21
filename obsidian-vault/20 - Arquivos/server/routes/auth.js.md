---
source_path: "server/routes/auth.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 30265
modified_at: "2026-04-17T20:00:32.435Z"
outbound_local_refs: 27
inbound_local_refs: 1
---

# server/routes/auth.js

## O que é

Define endpoints e entrada HTTP.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/middleware/auth.js|server/middleware/auth.js]]
- Usa [[20 - Arquivos/server/middleware/csrf.js|server/middleware/csrf.js]]
- Usa [[20 - Arquivos/server/middleware/distributedRateLimit.js|server/middleware/distributedRateLimit.js]]
- Usa [[20 - Arquivos/server/middleware/turnstile.js|server/middleware/turnstile.js]]
- Usa [[20 - Arquivos/server/middleware/validate.js|server/middleware/validate.js]]
- Usa [[20 - Arquivos/server/models/auditLogModel.js|server/models/auditLogModel.js]]
- Usa [[20 - Arquivos/server/models/minersModel.js|server/models/minersModel.js]]
- Usa [[20 - Arquivos/server/models/referralModel.js|server/models/referralModel.js]]
- Usa [[20 - Arquivos/server/models/refreshTokenModel.js|server/models/refreshTokenModel.js]]
- Usa [[20 - Arquivos/server/models/userModel.js|server/models/userModel.js]]
- Usa [[20 - Arquivos/server/services/accountLockoutService.js|server/services/accountLockoutService.js]]
- Usa [[20 - Arquivos/server/services/emailTwoFactorService.js|server/services/emailTwoFactorService.js]]
- Usa [[20 - Arquivos/server/services/slidingWindowRateLimit.js|server/services/slidingWindowRateLimit.js]]
- Usa [[20 - Arquivos/server/services/userOwnedMachineService.js|server/services/userOwnedMachineService.js]]
- Usa [[20 - Arquivos/server/src/audit/constants.js|server/src/audit/constants.js]]
- Usa [[20 - Arquivos/server/src/audit/service.js|server/src/audit/service.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/utils/adminPasswordResetPolicy.js|server/utils/adminPasswordResetPolicy.js]]
- Usa [[20 - Arquivos/server/utils/authTokens.js|server/utils/authTokens.js]]
- Usa [[20 - Arquivos/server/utils/clientIp.js|server/utils/clientIp.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]
- Usa [[20 - Arquivos/server/utils/mailer.js|server/utils/mailer.js]]
- Usa [[20 - Arquivos/server/utils/securityErrors.js|server/utils/securityErrors.js]]
- Usa [[20 - Arquivos/server/utils/securityLogger.js|server/utils/securityLogger.js]]
- Usa [[20 - Arquivos/server/utils/token.js|server/utils/token.js]]
- Usa [[20 - Arquivos/server/validation/registerBodySchema.js|server/validation/registerBodySchema.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/server.js|server/server.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `30265 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
