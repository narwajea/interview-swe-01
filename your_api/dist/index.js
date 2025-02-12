"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const bullmq_1 = require("bullmq");
const tsyringe_1 = require("tsyringe");
const container_1 = require("./container");
const transaction_controller_1 = require("./controllers/transaction.controller");
const transaction_processor_1 = require("./processors/transaction.processor");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("./utils/logger"));
const port = process.env.PORT ?? 3200;
async function bootstrap() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // Setup dependency injection
    await (0, container_1.setupContainer)();
    const redis = tsyringe_1.container.resolve(ioredis_1.default);
    // Setup workers
    const transactionProcessor = tsyringe_1.container.resolve(transaction_processor_1.TransactionProcessor);
    const transactionsWorker = new bullmq_1.Worker(container_1.PROCESS_TRANSACTIONS_QUEUE_NAME, transactionProcessor.processTransaction.bind(transactionProcessor), {
        connection: redis
    });
    void transactionsWorker; // Show intent to ignore
    const thirdPartyWorker = new bullmq_1.Worker(container_1.CHECK_THIRDPARTY_QUEUE_NAME, transactionProcessor.checkThirdParty.bind(transactionProcessor), {
        connection: redis
    });
    void thirdPartyWorker; // Show intent to ignore
    // Routes
    const transactionController = tsyringe_1.container.resolve(transaction_controller_1.TransactionController);
    app.post('/transaction', transactionController.createTransaction.bind(transactionController));
    app.post('/webhook', transactionController.handleWebhook.bind(transactionController));
    app.listen(port, () => {
        logger_1.default.info(`API is running on port ${port}`);
    });
}
bootstrap().catch(logger_1.default.error);
