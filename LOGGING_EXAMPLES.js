/**
 * EXEMPLOS DE USO DO SISTEMA DE LOGS APRIMORADO
 * 
 * Este arquivo demonstra como usar os métodos especializados de logging
 * em diferentes cenários da aplicação BlockMiner.
 * 
 * Para implementar nos controllers, copie os exemplos relevantes e adapte
 * conforme necessário.
 */

const logger = require("./utils/logger");

// ============================================
// 1. LOGS DE SEGURANÇA
// ============================================

// Exemplo: Login de usuário
function loginExample(req, res) {
  const { email, password } = req.body;
  
  // Login bem-sucedido
  logger.security("User login successful", {
    userId: user.id,
    email: user.email,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    loginMethod: "email_password"
  });
  
  // Login falhou
  logger.security("User login failed - invalid credentials", {
    email: email,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    attemptNumber: 3
  });
  
  // Conta bloqueada por múltiplas tentativas
  logger.security("Account locked due to failed login attempts", {
    userId: user.id,
    email: user.email,
    ip: req.ip,
    failedAttempts: 5,
    lockDuration: "30 minutes"
  });
}

// Exemplo: Rate limiting
function rateLimitExample(req) {
  logger.security("Rate limit exceeded", {
    ip: req.ip,
    endpoint: req.path,
    method: req.method,
    requestCount: 100,
    timeWindow: "1 minute"
  });
}

// Exemplo: Tentativa de acesso não autorizado
function unauthorizedAccessExample(req, userId) {
  logger.security("Unauthorized access attempt", {
    userId: userId,
    requestedResource: req.path,
    method: req.method,
    ip: req.ip,
    reason: "Insufficient permissions"
  });
}

// Exemplo: Atividade suspeita
function suspiciousActivityExample(req, userId) {
  logger.security("Suspicious activity detected", {
    userId: userId,
    type: "sql_injection_attempt",
    endpoint: req.path,
    payload: req.body,
    ip: req.ip,
    userAgent: req.get("user-agent")
  });
}

// ============================================
// 2. LOGS DE TRANSAÇÕES
// ============================================

// Exemplo: Depósito de criptomoeda
function depositExample(userId, depositData) {
  logger.transaction("deposit", "Crypto deposit confirmed", {
    userId: userId,
    depositId: depositData.id,
    amount: depositData.amount,
    currency: depositData.currency,
    txHash: depositData.txHash,
    blockNumber: depositData.blockNumber,
    confirmations: depositData.confirmations,
    status: "confirmed",
    creditedBalance: depositData.newBalance
  });
}

// Exemplo: Saque de USDT
function withdrawalExample(userId, withdrawalData) {
  // Saque iniciado
  logger.transaction("withdrawal", "Withdrawal request created", {
    userId: userId,
    withdrawalId: withdrawalData.id,
    amount: withdrawalData.amount,
    currency: "USDT",
    address: withdrawalData.address,
    fee: withdrawalData.fee,
    netAmount: withdrawalData.netAmount,
    status: "pending"
  });
  
  // Saque processado
  logger.transaction("withdrawal", "Withdrawal processed successfully", {
    userId: userId,
    withdrawalId: withdrawalData.id,
    amount: withdrawalData.amount,
    currency: "USDT",
    address: withdrawalData.address,
    txHash: withdrawalData.txHash,
    fee: withdrawalData.fee,
    netAmount: withdrawalData.netAmount,
    status: "completed",
    processingTime: "45 seconds"
  });
  
  // Saque falhou
  logger.transaction("withdrawal", "Withdrawal failed", {
    userId: userId,
    withdrawalId: withdrawalData.id,
    amount: withdrawalData.amount,
    currency: "USDT",
    address: withdrawalData.address,
    status: "failed",
    reason: withdrawalData.error,
    refunded: true
  });
}

// Exemplo: Swap de moedas
function swapExample(userId, swapData) {
  logger.transaction("swap", "Currency swap executed", {
    userId: userId,
    swapId: swapData.id,
    fromCurrency: swapData.fromCurrency,
    toCurrency: swapData.toCurrency,
    fromAmount: swapData.fromAmount,
    toAmount: swapData.toAmount,
    exchangeRate: swapData.rate,
    fee: swapData.fee,
    slippage: swapData.slippage,
    status: "completed"
  });
}

// Exemplo: Compra na loja (shop)
function shopPurchaseExample(userId, purchaseData) {
  logger.transaction("purchase", "Item purchased from shop", {
    userId: userId,
    purchaseId: purchaseData.id,
    itemId: purchaseData.itemId,
    itemName: purchaseData.itemName,
    quantity: purchaseData.quantity,
    pricePerUnit: purchaseData.pricePerUnit,
    totalPrice: purchaseData.totalPrice,
    currency: "BMC",
    paymentMethod: "balance",
    status: "completed"
  });
}

// Exemplo: Compra de GPU para mineração
function gpuPurchaseExample(userId, gpuData) {
  logger.transaction("purchase", "Mining GPU purchased", {
    userId: userId,
    gpuId: gpuData.id,
    gpuModel: gpuData.model,
    tier: gpuData.tier,
    hashPower: gpuData.hashPower,
    price: gpuData.price,
    currency: "BMC",
    status: "installed"
  });
}

// Exemplo: Faucet claim
function faucetClaimExample(userId, claimData) {
  logger.transaction("faucet_claim", "Faucet reward claimed", {
    userId: userId,
    amount: claimData.amount,
    currency: claimData.currency,
    claimType: "daily_faucet",
    cooldownHours: 24,
    nextClaimAvailable: claimData.nextClaimTime
  });
}

// ============================================
// 3. LOGS DE AUDITORIA
// ============================================

// Exemplo: Admin bane usuário
function adminBanUserExample(adminEmail, targetUserId) {
  logger.audit("user_banned", adminEmail, {
    targetUserId: targetUserId,
    reason: "Violation of terms of service",
    duration: "permanent",
    banType: "account_suspension",
    ipBanned: false
  });
}

// Exemplo: Admin altera configuração do sistema
function adminConfigChangeExample(adminEmail, setting) {
  logger.audit("system_config_updated", adminEmail, {
    setting: setting.key,
    oldValue: setting.oldValue,
    newValue: setting.newValue,
    category: "withdrawal_limits",
    effectiveImmediately: true
  });
}

// Exemplo: Admin concede permissão
function adminGrantPermissionExample(adminEmail, targetUserId) {
  logger.audit("permission_granted", adminEmail, {
    targetUserId: targetUserId,
    permission: "moderator",
    scope: "all",
    expiresAt: null
  });
}

// Exemplo: Admin visualiza dados sensíveis
function adminViewSensitiveDataExample(adminEmail, resource) {
  logger.audit("sensitive_data_accessed", adminEmail, {
    resource: resource.type,
    resourceId: resource.id,
    reason: "User support ticket #12345",
    dataFields: ["email", "balance", "transaction_history"]
  });
}

// Exemplo: Admin deleta dados
function adminDeleteDataExample(adminEmail, resource) {
  logger.audit("data_deleted", adminEmail, {
    resourceType: resource.type,
    resourceId: resource.id,
    reason: "User requested account deletion (GDPR)",
    backupCreated: true,
    backupPath: resource.backupPath
  });
}

// Exemplo: Sistema executa manutenção automatizada
function systemMaintenanceExample() {
  logger.audit("automated_maintenance_completed", "system", {
    task: "database_cleanup",
    recordsDeleted: 1523,
    tables: ["expired_sessions", "old_logs"],
    duration: "2.5 seconds"
  });
}

// Exemplo: Admin reinicia serviço
function adminRestartServiceExample(adminEmail, service) {
  logger.audit("service_restarted", adminEmail, {
    service: service.name,
    reason: "Memory leak detected",
    downtime: "5 seconds",
    usersAffected: service.activeConnections
  });
}

// ============================================
// 4. LOGS CRÍTICOS
// ============================================

// Exemplo: Perda de conexão com banco de dados
function databaseConnectionLostExample(error) {
  logger.critical("Database connection lost", {
    error: error.message,
    stack: error.stack,
    affectedServices: ["wallet", "mining", "transactions", "authentication"],
    autoReconnectAttempts: 3,
    reconnectStatus: "retrying"
  });
}

// Exemplo: Falha crítica no processamento de saques
function withdrawalSystemFailureExample(error) {
  logger.critical("Withdrawal processing system failure", {
    error: error.message,
    stack: error.stack,
    affectedWithdrawals: 15,
    totalAmount: "5000 USDT",
    action: "All withdrawals marked as pending for manual review",
    notificationSent: true
  });
}

// Exemplo: Detecção de brecha de segurança
function securityBreachExample(details) {
  logger.critical("Security breach detected", {
    type: details.type,
    severity: "HIGH",
    attackVector: details.vector,
    affectedResources: details.resources,
    mitigationAction: "Automatic IP ban applied",
    attackerIP: details.ip,
    notificationSent: true,
    policeCalled: false
  });
}

// Exemplo: Falta de memória
function outOfMemoryExample(usage) {
  logger.critical("System running out of memory", {
    currentUsage: usage.current,
    maxMemory: usage.max,
    percentUsed: usage.percent,
    largestConsumers: usage.topProcesses,
    action: "Automatic cache clearing initiated",
    restartRequired: usage.percent > 95
  });
}

// Exemplo: Falha na geração de backup
function backupFailureExample(error) {
  logger.critical("Automated backup failed", {
    error: error.message,
    backupType: "daily_full",
    lastSuccessfulBackup: "2026-02-22T03:00:00Z",
    hoursSinceLastBackup: 27,
    dataAtRisk: "All user data",
    action: "Manual intervention required"
  });
}

// ============================================
// 5. LOGS PADRÃO (Continuam funcionando normalmente)
// ============================================

function standardLoggingExample() {
  // Info - Operações normais
  logger.info("Server started successfully", {
    port: 3000,
    environment: "production",
    version: "2.0.0"
  });
  
  // Debug - Informações de desenvolvimento
  logger.debug("WebSocket connection established", {
    userId: 123,
    connectionId: "ws_abc123",
    rooms: ["mining:room1"]
  });
  
  // Warn - Situações anormais mas não críticas
  logger.warn("High memory usage detected", {
    current: "1.2 GB",
    threshold: "1.5 GB",
    percent: 80
  });
  
  // Error - Erros que afetam funcionalidades
  logger.error("Failed to send email notification", {
    userId: 123,
    emailType: "withdrawal_confirmation",
    error: "SMTP connection timeout",
    retryScheduled: true
  });
}

// ============================================
// 6. EXEMPLO COMPLETO: Fluxo de Saque
// ============================================

async function completeWithdrawalFlowExample(req, res) {
  const userId = req.user.id;
  const { amount, address } = req.body;
  
  try {
    // 1. Log de início da operação
    logger.info("Withdrawal request received", {
      userId,
      amount,
      currency: "USDT"
    });
    
    // 2. Validação de saldo
    const user = await getUserById(userId);
    if (user.balance < amount) {
      logger.warn("Withdrawal rejected - insufficient balance", {
        userId,
        requestedAmount: amount,
        currentBalance: user.balance
      });
      return res.status(400).json({ ok: false, message: "Saldo insuficiente" });
    }
    
    // 3. Validação de endereço (exemplo de detecção de fraude)
    const addressValidation = await validateAddress(address);
    if (addressValidation.suspicious) {
      logger.security("Suspicious withdrawal address detected", {
        userId,
        address,
        reason: addressValidation.reason,
        riskScore: addressValidation.score,
        action: "Withdrawal blocked for manual review"
      });
      return res.status(403).json({ ok: false, message: "Endereço bloqueado por segurança" });
    }
    
    // 4. Criar solicitação de saque
    const withdrawal = await createWithdrawal(userId, amount, address);
    
    logger.transaction("withdrawal", "Withdrawal request created", {
      userId,
      withdrawalId: withdrawal.id,
      amount,
      currency: "USDT",
      address,
      fee: withdrawal.fee,
      netAmount: withdrawal.netAmount,
      status: "pending"
    });
    
    // 5. Processar saque na blockchain
    try {
      const txHash = await processBlockchainWithdrawal(withdrawal);
      
      logger.transaction("withdrawal", "Withdrawal processed successfully", {
        userId,
        withdrawalId: withdrawal.id,
        amount,
        txHash,
        status: "completed"
      });
      
      // 6. Log de auditoria para saques grandes
      if (amount > 10000) {
        logger.audit("large_withdrawal_processed", `user:${userId}`, {
          withdrawalId: withdrawal.id,
          amount,
          address,
          txHash,
          requiresReview: true
        });
      }
      
      return res.json({ ok: true, txHash, withdrawal });
      
    } catch (blockchainError) {
      // 7. Erro crítico no processamento
      logger.critical("Blockchain withdrawal processing failed", {
        userId,
        withdrawalId: withdrawal.id,
        amount,
        error: blockchainError.message,
        stack: blockchainError.stack,
        action: "Funds returned to user balance"
      });
      
      // Reverter saldo
      await refundWithdrawal(withdrawal.id);
      
      logger.transaction("withdrawal", "Withdrawal failed and refunded", {
        userId,
        withdrawalId: withdrawal.id,
        amount,
        status: "failed",
        refunded: true
      });
      
      return res.status(500).json({ ok: false, message: "Erro ao processar saque" });
    }
    
  } catch (error) {
    logger.error("Unexpected error in withdrawal flow", {
      userId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ ok: false, message: "Erro interno" });
  }
}

// ============================================
// EXPORTAR EXEMPLOS (apenas para referência)
// ============================================

module.exports = {
  loginExample,
  rateLimitExample,
  depositExample,
  withdrawalExample,
  swapExample,
  adminBanUserExample,
  databaseConnectionLostExample,
  completeWithdrawalFlowExample
};

