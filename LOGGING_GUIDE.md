# Sistema de Logs - Guia Rápido de Implementação

## ✅ O que foi implementado

### 1. Estrutura de Pastas
```
storage/
└── logs/
    ├── general/       # Logs gerais (info, debug)
    ├── critical/      # Logs críticos (error, warn)
    ├── security/      # Logs de segurança
    ├── transactions/  # Logs de transações financeiras
    └── audit/         # Logs de auditoria (ações admin)
```

### 2. Novos Métodos de Logging

#### `logger.security(message, data)`
Para eventos de segurança: autenticação, autorização, atividades suspeitas
```javascript
logger.security("Failed login attempt", {
  email: "user@example.com",
  ip: "192.168.1.1",
  reason: "Invalid password"
});
```

#### `logger.transaction(type, message, data)`
Para transações financeiras: depósitos, saques, swaps, compras
```javascript
logger.transaction("withdrawal", "Withdrawal processed", {
  userId: 123,
  amount: 100.50,
  currency: "USDT",
  txHash: "0xabc..."
});
```

#### `logger.audit(action, actor, data)`
Para ações administrativas e mudanças sensíveis
```javascript
logger.audit("user_banned", "admin@blockminer.com", {
  targetUserId: 456,
  reason: "Terms violation"
});
```

#### `logger.critical(message, data)`
Para erros graves que requerem atenção imediata
```javascript
logger.critical("Database connection lost", {
  error: error.message,
  affectedServices: ["wallet", "mining"]
});
```

## 📝 Como Implementar nos Controllers

### Exemplo 1: walletController.js (Saques)

```javascript
const logger = require("../utils/logger").child("WalletController");

// No início do processo de saque
logger.transaction("withdrawal", "Withdrawal request created", {
  userId: req.user.id,
  amount: amount,
  currency: "USDT",
  address: address,
  status: "pending"
});

// Se o saque for bem-sucedido
logger.transaction("withdrawal", "Withdrawal processed successfully", {
  userId: req.user.id,
  withdrawalId: withdrawal.id,
  amount: amount,
  txHash: txHash,
  status: "completed"
});

// Se houver erro crítico
logger.critical("Withdrawal processing failed", {
  userId: req.user.id,
  error: error.message,
  amount: amount
});
```

### Exemplo 2: adminAuthController.js (Já implementado)

```javascript
// Login de admin bem-sucedido
logger.audit("admin_login_success", userEmail, {
  ip: req.ip,
  userAgent: req.get("user-agent")
});

// Tentativa de login falhada
logger.security("Admin login failed - invalid credentials", {
  email: userEmail,
  ip: req.ip,
  emailMatch: false
});
```

### Exemplo 3: shopController.js (Compras)

```javascript
// Compra realizada
logger.transaction("purchase", "Item purchased from shop", {
  userId: req.user.id,
  itemId: item.id,
  itemName: item.name,
  quantity: quantity,
  totalPrice: totalPrice,
  currency: "BMC"
});
```

### Exemplo 4: faucetController.js (Recompensas)

```javascript
// Claim do faucet
logger.transaction("faucet_claim", "Faucet reward claimed", {
  userId: req.user.id,
  amount: reward.amount,
  currency: reward.currency,
  claimType: "daily_faucet"
});
```

## 🔍 Como Consultar os Logs

### Via PowerShell (Windows)

```powershell
# Ver logs de transações
Get-Content storage\logs\transactions\info.log | Select-String "withdrawal"

# Ver tentativas de login falhadas
Get-Content storage\logs\security\warn.log | Select-String "Failed login"

# Ver ações de admin
Get-Content storage\logs\audit\info.log

# Ver erros críticos
Get-Content storage\logs\critical\error.log

# Últimas 20 linhas de um log
Get-Content storage\logs\transactions\info.log -Tail 20

# Monitorar em tempo real
Get-Content storage\logs\security\warn.log -Wait
```

### Via Linux/Mac

```bash
# Ver logs de transações
grep "withdrawal" storage/logs/transactions/info.log

# Ver tentativas de login falhadas
grep "Failed login" storage/logs/security/warn.log

# Ver ações de admin
cat storage/logs/audit/info.log

# Últimas 20 linhas
tail -n 20 storage/logs/transactions/info.log

# Monitorar em tempo real
tail -f storage/logs/security/warn.log
```

## 🎯 Próximos Passos

1. **Implementar nos Controllers** - Use os exemplos em `LOGGING_EXAMPLES.js`
2. **Adicionar nos Crons** - Logar execuções de tarefas agendadas
3. **Integrar com Monitoring** - Configurar alertas para logs críticos
4. **Backup Regular** - Arquivar logs antigos mensalmente

## 📊 Teste o Sistema

Execute: `node test-logging.js`

Isso criará logs de exemplo em todas as categorias e você poderá verificar se está funcionando corretamente.

## 📚 Documentação Completa

Consulte `storage/README.md` para documentação detalhada com todos os exemplos de uso.

