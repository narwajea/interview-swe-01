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
exports.TransactionController = void 0;
const tsyringe_1 = require("tsyringe");
const transaction_service_1 = require("../services/transaction.service");
const transaction_schema_1 = require("../schemas/transaction.schema");
const zod_1 = require("zod");
const logger_1 = __importDefault(require("../utils/logger"));
const transaction_processor_1 = require("../processors/transaction.processor");
const component = 'TransactionController';
let TransactionController = class TransactionController {
    constructor(transactionService, transactionProcessor) {
        this.transactionService = transactionService;
        this.transactionProcessor = transactionProcessor;
    }
    async createTransaction(req, res) {
        try {
            const { id } = transaction_schema_1.createTransactionSchema.parse(req.body);
            logger_1.default.info('Received create transaction request', { id, component });
            await this.transactionService.createTransaction(id);
            logger_1.default.info('Transaction creation processed', { id, component });
            res.json({ id, status: 'pending' });
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                logger_1.default.warn('Validation error', { component, errors: error.errors });
                res.status(400).json({ error: 'Invalid input', details: error.errors });
                return;
            }
            logger_1.default.error('Error creating transaction', { component, error });
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    async handleWebhook(req, res) {
        try {
            const { id, status } = transaction_schema_1.webhookSchema.parse(req.body);
            logger_1.default.info('Received webhook', { id, component, status });
            await this.transactionProcessor.sendTransactionStatusUpdate(id, status);
            logger_1.default.info('Webhook processed', { id, component, status });
            res.sendStatus(200);
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                logger_1.default.warn('Validation error', { component, errors: error.errors });
                res.status(400).json({ error: 'Invalid input', details: error.errors });
                return;
            }
            logger_1.default.error('Error processing webhook', { component, error });
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};
exports.TransactionController = TransactionController;
exports.TransactionController = TransactionController = __decorate([
    (0, tsyringe_1.singleton)(),
    __metadata("design:paramtypes", [transaction_service_1.TransactionService,
        transaction_processor_1.TransactionProcessor])
], TransactionController);
