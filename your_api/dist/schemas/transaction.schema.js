"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookSchema = exports.createTransactionSchema = void 0;
const zod_1 = require("zod");
const transaction_state_1 = require("./transaction-state");
exports.createTransactionSchema = zod_1.z.object({
    id: zod_1.z.string().uuid()
});
exports.webhookSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    status: zod_1.z.enum([transaction_state_1.TransactionState.completed, transaction_state_1.TransactionState.declined])
});
