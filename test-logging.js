/**
 * Test script to verify the enhanced logging system
 * Run: node test-logging.js
 */

const logger = require("./utils/logger");

console.log("\n=== Testing Enhanced Logging System ===\n");

// Test 1: Standard logging methods
console.log("1. Testing standard logging methods...");
logger.info("Test info message", { test: true, timestamp: new Date().toISOString() });
logger.warn("Test warning message", { level: "medium" });
logger.error("Test error message", { errorCode: 500 });
logger.debug("Test debug message", { data: "debug info" });

// Test 2: Security logging
console.log("\n2. Testing security logging...");
logger.security("Test security event - failed login", {
  email: "test@example.com",
  ip: "192.168.1.1",
  reason: "Invalid password",
  attemptNumber: 3
});

logger.security("Test security event - suspicious activity", {
  userId: 999,
  type: "rate_limit_exceeded",
  requests: 100,
  timeWindow: "1 minute"
});

// Test 3: Transaction logging
console.log("\n3. Testing transaction logging...");
logger.transaction("deposit", "Test crypto deposit", {
  userId: 123,
  amount: 1.5,
  currency: "ETH",
  txHash: "0x123abc...",
  status: "confirmed"
});

logger.transaction("withdrawal", "Test withdrawal", {
  userId: 456,
  amount: 100,
  currency: "USDT",
  address: "0xabc123...",
  fee: 2.5,
  status: "pending"
});

logger.transaction("swap", "Test currency swap", {
  userId: 789,
  fromCurrency: "BTC",
  toCurrency: "ETH",
  fromAmount: 0.01,
  toAmount: 0.15,
  rate: 15.0
});

logger.transaction("purchase", "Test shop purchase", {
  userId: 321,
  itemId: "gpu_rtx_4090",
  quantity: 1,
  price: 500,
  currency: "BMC"
});

// Test 4: Audit logging
console.log("\n4. Testing audit logging...");
logger.audit("user_banned", "admin@blockminer.com", {
  targetUserId: 999,
  reason: "Terms violation",
  duration: "7 days"
});

logger.audit("config_updated", "system", {
  setting: "withdrawal_limit",
  oldValue: 1000,
  newValue: 2000
});

logger.audit("permission_granted", "admin@blockminer.com", {
  targetUserId: 888,
  permission: "moderator",
  scope: "chat_moderation"
});

// Test 5: Critical logging
console.log("\n5. Testing critical logging...");
logger.critical("Test critical error - database connection", {
  error: "Connection timeout",
  affectedServices: ["wallet", "mining"],
  autoReconnect: true
});

logger.critical("Test critical error - security breach", {
  type: "sql_injection_attempt",
  ip: "192.168.1.100",
  endpoint: "/api/wallet/balance",
  mitigated: true
});

// Test 6: Child logger
console.log("\n6. Testing child logger...");
const walletLogger = logger.child("Wallet");
walletLogger.info("Child logger test - wallet balance updated", {
  userId: 123,
  newBalance: 1500.50
});

walletLogger.transaction("withdrawal", "Withdrawal via child logger", {
  userId: 123,
  amount: 50,
  currency: "USDT"
});

console.log("\n=== Logging Tests Completed ===");
console.log("\nCheck the following directories for log files:");
console.log("- storage/logs/general/     (info.log, debug.log)");
console.log("- storage/logs/critical/    (error.log, warn.log)");
console.log("- storage/logs/security/    (warn.log)");
console.log("- storage/logs/transactions/ (info.log)");
console.log("- storage/logs/audit/       (info.log)");
console.log("\n");

