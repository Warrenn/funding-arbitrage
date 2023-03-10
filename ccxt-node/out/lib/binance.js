import ccxt from 'ccxt';
export class BinanceExchange extends ccxt.pro.binance {
    constructor() {
        super(...arguments);
        this.fetchingDeposits = false;
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return this.fetchOpenOrders(symbol, since, limit, params);
        };
        this.setRiskLimit = async (riskLimit, symbol) => {
        };
    }
    async fetchPosition(symbol, params) {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }
    async fetchOrder(id, symbol, params) {
        let market = this.market(symbol);
        if (market.margin && !market.swap)
            params = Object.assign(Object.assign({}, params), { marginMode: 'isolated' });
        return super.fetchOrder(id, symbol, params);
    }
    async createOrder(symbol, type, side, amount, price, params) {
        let market = this.market(symbol);
        if (market.margin && !market.swap)
            params = Object.assign(Object.assign({}, params), { marginMode: 'isolated' });
        if ((params === null || params === void 0 ? void 0 : params.type) == 'market') {
            delete params.timeInForce;
        }
        return super.createOrder(symbol, type, side, amount, price, params);
    }
    async fetchOpenOrders(symbol, since, limit, params) {
        if (symbol) {
            let market = this.market(symbol);
            if (market.margin && !market.swap)
                params = Object.assign(Object.assign({}, params), { marginMode: 'isolated' });
        }
        return super.fetchOpenOrders(symbol, since, limit, params);
    }
    async fetchDeposits(code = undefined, since = undefined, limit = undefined, params = {}) {
        this.fetchingDeposits = true;
        const response = await super.fetchDeposits(code, since, limit, params);
        this.fetchingDeposits = false;
        return response;
    }
    parseTransaction(transaction, currency = undefined) {
        if (this.fetchingDeposits) {
            transaction = Object.assign({ transactionType: '0' }, transaction);
        }
        return super.parseTransaction(transaction, currency);
    }
    async fetchBalance(params) {
        if ((params === null || params === void 0 ? void 0 : params.type) === this.options.fundingAccount) {
            const response = await this['sapiV3PostAssetGetUserAsset']({});
            return this.parseBalance(response, 'funding', '');
        }
        if ((params === null || params === void 0 ? void 0 : params.type) === this.options.tradingAccount) {
            let defaultMarginMode = this.options.defaultMarginMode;
            this.options.defaultMarginMode = '';
            const response = await super.fetchBalance(params);
            this.options.defaultMarginMode = defaultMarginMode;
            return response;
        }
        return super.fetchBalance(params);
    }
}
//# sourceMappingURL=binance.js.map