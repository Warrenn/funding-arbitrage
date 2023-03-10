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
        //TODO:Must figure out a better way to get the max order limit
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
    async withdraw(currency, amount, address, tag, params) {
        if (params === null || params === void 0 ? void 0 : params.network)
            params = Object.assign(Object.assign({}, params), { smart_contract_name: params.network });
        return await super.withdraw(currency, amount, address, tag, params);
    }
    ;
    async createOrder(symbol, type, side, amount, price, params) {
        if ((params === null || params === void 0 ? void 0 : params.reduceOnly) && !(params === null || params === void 0 ? void 0 : params.positionId)) {
            if (!(symbol in this.positionIds))
                await this.fetchPosition(symbol);
            params = Object.assign(Object.assign({}, params), { positionId: this.positionIds[symbol] });
        }
        return super.createOrder(symbol, type, side, amount, price, params);
    }
    async setLeverage(leverage, symbol = undefined, params = {}) {
        try {
            return await super.setLeverage(leverage, symbol, params);
        }
        catch (err) {
            if (('name' in err) &&
                ('message' in err) &&
                err.name === 'ExchangeError' &&
                err.message == 'order exist') {
                console.log(err);
                return {};
            }
            throw err;
        }
    }
}
//# sourceMappingURL=coinex.js.map