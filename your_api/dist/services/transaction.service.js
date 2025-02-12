"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionService = void 0;
const tsyringe_1 = require("tsyringe");
const bullmq_1 = require("bullmq");
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const container_1 = require("../container");
const transaction_state_1 = require("../schemas/transaction-state");
const component = 'TransactionService';
const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3100';
let TransactionService = class TransactionService {
    constructor(checkThirdpartyQueue, processTransactionsQueue) {
        this.checkThirdpartyQueue = checkThirdpartyQueue;
        this.processTransactionsQueue = processTransactionsQueue;
    }
    async createTransaction(id) {
        logger_1.default.info('Creating transaction', { id, component });
        await this.processTransactionsQueue.add('process-transaction', { id }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });
        logger_1.default.info('Transaction queued', { id, component });
    }
    async checkThirdParty(id, initialDelay, attempts, retryInterval) {
        logger_1.default.info('Checking third party', { id, component });
        await this.checkThirdpartyQueue.add('check-thirdparty', { id }, {
            attempts,
            delay: initialDelay,
            backoff: {
                type: 'fixed',
                delay: retryInterval
            }
        });
        logger_1.default.info('Check queued', { id, component });
    }
    async sendTransactionStatusUpdate(id, status) {
        logger_1.default.info('Sending transaction status update', { id, component, status });
        try {
            await axios_1.default.put(`${clientUrl}/transaction`, {
                status: {
                    id,
                    status: status === transaction_state_1.TransactionState.completed ? 'accepted' : 'declined'
                }
            });
            logger_1.default.info('Transaction status update sent', { id, component, status });
        }
        catch (error) {
            logger_1.default.error('Error sending transaction status update', { id, component, error });
        }
    }
};
exports.TransactionService = TransactionService;
exports.TransactionService = TransactionService = __decorate([
    (0, tsyringe_1.singleton)(),
    __param(0, (0, tsyringe_1.inject)(container_1.CHECK_THIRDPARTY_QUEUE_NAME)),
    __param(1, (0, tsyringe_1.inject)(container_1.PROCESS_TRANSACTIONS_QUEUE_NAME)),
    __metadata("design:paramtypes", [bullmq_1.Queue,
        bullmq_1.Queue])
], TransactionService);
