"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROCESS_TRANSACTIONS_QUEUE_NAME = exports.CHECK_THIRDPARTY_QUEUE_NAME = void 0;
exports.setupContainer = setupContainer;
const tsyringe_1 = require("tsyringe");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
exports.CHECK_THIRDPARTY_QUEUE_NAME = 'check-thirdparty';
exports.PROCESS_TRANSACTIONS_QUEUE_NAME = 'process-transactions';
const host = process.env.REDIS_HOST ?? 'localhost';
const port = parseInt(process.env.REDIS_PORT ?? '6379');
async function setupContainer() {
    // Setup Redis client
    const redis = new ioredis_1.default({
        host,
        maxRetriesPerRequest: null,
        port
    });
    // Setup Queues
    const checkThirdpartyQueue = new bullmq_1.Queue(exports.CHECK_THIRDPARTY_QUEUE_NAME, {
        connection: redis,
        defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: true
        }
    });
    const processTransactionsQueue = new bullmq_1.Queue(exports.PROCESS_TRANSACTIONS_QUEUE_NAME, {
        connection: redis,
        defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: true
        }
    });
    // Register instances
    tsyringe_1.container.registerInstance(ioredis_1.default, redis);
    tsyringe_1.container.registerInstance(exports.CHECK_THIRDPARTY_QUEUE_NAME, checkThirdpartyQueue);
    tsyringe_1.container.registerInstance(exports.PROCESS_TRANSACTIONS_QUEUE_NAME, processTransactionsQueue);
}
