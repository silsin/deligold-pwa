-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "nationalId" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "verifyNote" TEXT,
    "address" TEXT,
    "idCardPath" TEXT,
    "brokerId" TEXT,
    "createdById" TEXT,
    "redeemedInviteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_redeemedInviteId_fkey" FOREIGN KEY ("redeemedInviteId") REFERENCES "Invite" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brokerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "phone" TEXT,
    "logoPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Store_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL,
    "unit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortId" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invite_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "allowBuy" BOOLEAN NOT NULL DEFAULT true,
    "allowSell" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerPermission_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL NOT NULL DEFAULT 0,
    "trustedDestinations" TEXT NOT NULL DEFAULT '[]',
    "destinationsUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "grams" DECIMAL NOT NULL DEFAULT 0,
    "avgCost" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Position_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TRADE',
    "grams" DECIMAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "fee" DECIMAL NOT NULL,
    "pnl" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'FILLED',
    "fulfillment" TEXT,
    "deliveryAddress" TEXT,
    "receiptPath" TEXT,
    "receiptNote" TEXT,
    "receiptAt" DATETIME,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "convertId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_convertId_fkey" FOREIGN KEY ("convertId") REFERENCES "Convert" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Convert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromSymbol" TEXT NOT NULL,
    "toSymbol" TEXT NOT NULL,
    "gramsIn" DECIMAL NOT NULL,
    "gramsOut" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "fee" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deposit_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "fee" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "destination" TEXT,
    "note" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Withdrawal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "brokerId" TEXT,
    "symbol" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "postedAt" DATETIME NOT NULL,
    "memo" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "walletId" TEXT,
    "postedById" TEXT,
    "totalDebit" DECIMAL NOT NULL,
    "totalCredit" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "symbol" TEXT,
    "grams" DECIMAL,
    CONSTRAINT "LedgerLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LedgerEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "grams" DECIMAL NOT NULL DEFAULT 0,
    "avgCost" DECIMAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreHolding_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "grams" DECIMAL NOT NULL,
    "price" DECIMAL,
    "reason" TEXT,
    "entryId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoardPrice" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "price" DECIMAL,
    "buy" DECIMAL,
    "sell" DECIMAL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowBuy" BOOLEAN NOT NULL DEFAULT true,
    "allowSell" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrokerPriceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brokerId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowBuy" BOOLEAN NOT NULL DEFAULT true,
    "allowSell" BOOLEAN NOT NULL DEFAULT true,
    "buyMarginToman" DECIMAL NOT NULL DEFAULT 0,
    "sellMarginToman" DECIMAL NOT NULL DEFAULT 0,
    "buyMarginPercent" DECIMAL NOT NULL DEFAULT 0,
    "sellMarginPercent" DECIMAL NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrokerPriceRule_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoleChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "granterId" TEXT,
    "fromRole" TEXT,
    "toRole" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleChange_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoleChange_granterId_fkey" FOREIGN KEY ("granterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "config" TEXT NOT NULL DEFAULT '{}',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceTick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "buy" DECIMAL,
    "sell" DECIMAL,
    "recordedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChartAnnotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "source" TEXT,
    "kind" TEXT NOT NULL,
    "points" TEXT NOT NULL,
    "color" TEXT,
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_brokerId_idx" ON "User"("brokerId");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_slug_key" ON "Broker"("slug");

-- CreateIndex
CREATE INDEX "StoreProduct_storeId_idx" ON "StoreProduct"("storeId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_brokerId_idx" ON "Invite"("brokerId");

-- CreateIndex
CREATE INDEX "CustomerPermission_userId_idx" ON "CustomerPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPermission_userId_symbol_key" ON "CustomerPermission"("userId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Position_symbol_idx" ON "Position"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Position_walletId_symbol_key" ON "Position"("walletId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Order_ref_key" ON "Order"("ref");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_symbol_createdAt_idx" ON "Order"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "Order_kind_createdAt_idx" ON "Order"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Convert_ref_key" ON "Convert"("ref");

-- CreateIndex
CREATE INDEX "Convert_userId_createdAt_idx" ON "Convert"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_ref_key" ON "Deposit"("ref");

-- CreateIndex
CREATE INDEX "Deposit_walletId_createdAt_idx" ON "Deposit"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_ref_key" ON "Withdrawal"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Withdrawal_walletId_createdAt_idx" ON "Withdrawal"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_brokerId_symbol_key" ON "Account"("code", "brokerId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_ref_key" ON "LedgerEntry"("ref");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_postedAt_idx" ON "LedgerEntry"("userId", "postedAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletId_postedAt_idx" ON "LedgerEntry"("walletId", "postedAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_kind_postedAt_idx" ON "LedgerEntry"("kind", "postedAt");

-- CreateIndex
CREATE INDEX "LedgerLine_entryId_idx" ON "LedgerLine"("entryId");

-- CreateIndex
CREATE INDEX "LedgerLine_accountId_idx" ON "LedgerLine"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreHolding_storeId_symbol_key" ON "StoreHolding"("storeId", "symbol");

-- CreateIndex
CREATE INDEX "StoreMovement_storeId_createdAt_idx" ON "StoreMovement"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerPriceRule_brokerId_idx" ON "BrokerPriceRule"("brokerId");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerPriceRule_brokerId_symbol_targetRole_key" ON "BrokerPriceRule"("brokerId", "symbol", "targetRole");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "RoleChange_targetId_createdAt_idx" ON "RoleChange"("targetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSource_name_key" ON "PriceSource"("name");

-- CreateIndex
CREATE INDEX "PriceSource_enabled_priority_idx" ON "PriceSource"("enabled", "priority");

-- CreateIndex
CREATE INDEX "PriceTick_symbol_source_recordedAt_idx" ON "PriceTick"("symbol", "source", "recordedAt");

-- CreateIndex
CREATE INDEX "PriceTick_source_recordedAt_idx" ON "PriceTick"("source", "recordedAt");

-- CreateIndex
CREATE INDEX "ChartAnnotation_symbol_source_idx" ON "ChartAnnotation"("symbol", "source");
