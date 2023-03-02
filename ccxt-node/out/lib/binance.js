import ccxt from 'ccxt';
export class BinanceExchange extends ccxt.pro.binance {
    constructor() {
        super(...arguments);
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
    ;
}
//# sourceMappingURL=binance.js.map