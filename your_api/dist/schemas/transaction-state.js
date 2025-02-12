"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionState = void 0;
var TransactionState;
(function (TransactionState) {
    TransactionState["completed"] = "completed";
    TransactionState["declined"] = "declined";
    TransactionState["maybe_sent"] = "maybe_sent";
    TransactionState["sent"] = "sent";
})(TransactionState || (exports.TransactionState = TransactionState = {}));
