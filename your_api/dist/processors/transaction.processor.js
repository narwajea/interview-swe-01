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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionProcessor = void 0;
const tsyringe_1 = require("tsyringe");
const axios_1 = __importDefault(require("axios"));
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("../utils/logger"));
const transaction_service_1 = require("../services/transaction.service");
const transaction_state_1 = require("../schemas/transaction-state");
const LOCK_TTL = 600; // 10 min
const LOCK_PREFIX = 'transaction:lock:';
const TRANSACTION_STATE_TTL = 600; // 10 min
const TRANSACTION_STATE_PREFIX = 'transaction:state:';
const component = 'TransactionProcessor';
const thirdPartyUrl = process.env.THIRDPARTY_URL ?? 'http://localhost:3000';
const yourApiUrl = process.env.YOUR_API_URL ?? 'http://localhost:3200';
let TransactionProcessor = class TransactionProcessor {
    constructor(redis, transactionService) {
        this.redis = redis;
        this.transactionService = transactionService;
    }
    async checkThirdParty(job) {
        const { id } = job.data;
        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        logger_1.default.info('Checking third party', {
            id,
            component,
            attemptsMade: job.attemptsMade,
            isLastAttempt
        });
        const state = await this.getTransactionState(id);
        if (this.isTransactionFullyProcessed(state)) {
            logger_1.default.info('Transaction already processed', { id, component, state });
            return;
        }
        let transactionGetResponse;
        try {
            transactionGetResponse = await axios_1.default.get(`${thirdPartyUrl}/transaction/${id}`, {
                timeout: 5000
            });
        }
        catch (error) {
            const isAxiosError = axios_1.default.isAxiosError(error);
            const isTimeout = this.isTimeout(isAxiosError, error);
            if (isTimeout) {
                logger_1.default.warn('Request timed out, will retry', { id, component });
                throw error;
            }
            const transactionNotFound = isAxiosError && error.status === 404;
            if (transactionNotFound) {
                await this.handleTransactionNotFound(id, isLastAttempt);
                return;
            }
            logger_1.default.error('Check third party failed', { id, component, error });
            return;
        }
        const transactionStatus = transactionGetResponse.data.status;
        logger_1.default.info('Transaction found', { id, component, transactionStatus });
        const transactionAlreadyProcessed = transactionStatus &&
            [transaction_state_1.TransactionState.completed, transaction_state_1.TransactionState.declined].includes(transactionStatus);
        if (transactionAlreadyProcessed) {
            const state = transactionStatus;
            logger_1.default.info('Transaction already processed', { id, component, state });
            await this.sendTransactionStatusUpdate(id, state);
        }
        else {
            await this.setTransactionState(id, transaction_state_1.TransactionState.sent);
            logger_1.default.info('Transaction is pending, will retry', { id, component });
            throw new Error('Transaction is pending');
        }
    }
    async handleTransactionNotFound(id, isLastAttempt) {
        if (!isLastAttempt) {
            logger_1.default.info('Transaction not found, will retry', { id, component });
            throw new Error('Transaction not found');
        }
        else {
            logger_1.default.info('Transaction not found, attempting to create transaction again', {
                id,
                component
            });
            await this.removeTransactionState(id);
            await this.transactionService.createTransaction(id);
        }
    }
    async sendTransactionStatusUpdate(id, state) {
        const currentState = await this.getTransactionState(id);
        if (this.isTransactionFullyProcessed(currentState)) {
            logger_1.default.info('Transaction already processed', { id, component, currentState, state });
            return;
        }
        await this.setTransactionState(id, state);
        await this.transactionService.sendTransactionStatusUpdate(id, state);
    }
    async processTransaction(job) {
        const { id } = job.data;
        logger_1.default.info('Processing transaction', { id, component });
        // Try to acquire lock first
        const locked = await this.lockTransaction(id);
        if (!locked) {
            logger_1.default.info('Transaction is already locked', { id, component });
            return;
        }
        try {
            // Check if transaction was already processed
            const state = await this.getTransactionState(id);
            if (this.isTransactionFullyProcessed(state)) {
                logger_1.default.info('Transaction already processed', { id, component, state });
                return;
            }
            // Check if transaction was already sent to third party (in case of duplicate request)
            if (state === transaction_state_1.TransactionState.sent) {
                logger_1.default.info('Transaction already sent, checking transaction at third party', {
                    id,
                    component,
                    state
                });
                await this.transactionService.checkThirdParty(id, 0, 4, 30000);
                return;
            }
            // Check if previous request to third party timed out
            if (state === transaction_state_1.TransactionState.maybe_sent) {
                logger_1.default.info('Transaction may have been sent, checking transaction at third party', {
                    id,
                    component,
                    state
                });
                await this.transactionService.checkThirdParty(id, 10000, 8, 30000);
                return;
            }
            const response = await axios_1.default.post(`${thirdPartyUrl}/transaction`, {
                id,
                webhookUrl: `${yourApiUrl}/webhook`
            }, {
                timeout: 15000 // 15 second timeout
            });
            await this.setTransactionState(id, transaction_state_1.TransactionState.sent);
            logger_1.default.info('Transaction sent to third party successfully', {
                id,
                component,
                data: response.data
            });
            // the webhook might not be called, so we need to check anyway (delay comprised between 10 and 30s)
            await this.transactionService.checkThirdParty(id, 10000, 4, 30000);
        }
        catch (error) {
            const isAxiosError = axios_1.default.isAxiosError(error);
            const isTimeout = this.isTimeout(isAxiosError, error);
            if (isTimeout) {
                logger_1.default.warn('Request timed out, will retry', { id, component });
                await this.setTransactionState(id, transaction_state_1.TransactionState.maybe_sent);
                throw error;
            }
            logger_1.default.error('Transaction failed', { id, component, error });
        }
        finally {
            // Always release the lock
            await this.unlockTransaction(id);
        }
    }
    isTimeout(isAxiosError, error) {
        return isAxiosError && (error.code === 'ECONNABORTED' || error.status === 504);
    }
    isTransactionFullyProcessed(state) {
        return state && [transaction_state_1.TransactionState.completed, transaction_state_1.TransactionState.declined].includes(state);
    }
    async getTransactionState(id) {
        const stateKey = this.transactionStateKey(id);
        const state = await this.redis.get(stateKey);
        return state ? state : null;
    }
    async setTransactionState(id, state) {
        const stateKey = this.transactionStateKey(id);
        await this.redis.set(stateKey, state, 'EX', TRANSACTION_STATE_TTL);
    }
    async removeTransactionState(id) {
        const stateKey = this.transactionStateKey(id);
        await this.redis.del(stateKey);
    }
    async lockTransaction(id) {
        const lockKey = this.transactionLockKey(id);
        const result = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL, 'NX');
        return result === 'OK';
    }
    async unlockTransaction(id) {
        const lockKey = this.transactionLockKey(id);
        await this.redis.del(lockKey);
    }
    transactionLockKey(id) {
        return `${LOCK_PREFIX}${id}`;
    }
    transactionStateKey(id) {
        return `${TRANSACTION_STATE_PREFIX}${id}`;
    }
};
exports.TransactionProcessor = TransactionProcessor;
exports.TransactionProcessor = TransactionProcessor = __decorate([
    (0, tsyringe_1.singleton)(),
    __metadata("design:paramtypes", [ioredis_1.default,
        transaction_service_1.TransactionService])
], TransactionProcessor);
