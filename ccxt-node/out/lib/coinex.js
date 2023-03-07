import ccxt from 'ccxt';
export class CoinexExchange extends ccxt.pro.coinex {
    constructor() {
        super(...arguments);
        this.positionIds = {};
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        };
        this.setRiskLimit = async (riskLimit, symbol) => {
        };
    }
    market(symbol) {
        var _a, _b;
        let market = super.market(symbol);
        if (!((_a = market.limits.amount) === null || _a === void 0 ? void 0 : _a.max))
            market.limits.amount = { max: 9999, min: (_b = market.limits.amount) === null || _b === void 0 ? void 0 : _b.min };
        return market;
    }
    async fetchPosition(symbol, params) {
        let position = await super.fetchPosition(symbol, params);
        if (position.contracts == undefined && !!position.contractSize) {
            position.contracts = parseFloat(position.contractSize);
            position.contractSize = 1;
        }
        if (!(symbol in this.positionIds) && position.id) {
            this.positionIds[symbol] = position.id;
        }
        return position;
    }
    async createOrder(symbol, type, side, amount, price, params) {
        if ((params === null || params === void 0 ? void 0 : params.reduceOnly) && !(params === null || params === void 0 ? void 0 : params.positionId)) {
            if (!(symbol in this.positionIds))
                await this.fetchPosition(symbol);
            params = Object.assign(Object.assign({}, params), { positionId: this.positionIds[symbol] });
        }
        return super.createOrder(symbol, type, side, amount, price, params);
    }
}
//# sourceMappingURL=coinex.js.map