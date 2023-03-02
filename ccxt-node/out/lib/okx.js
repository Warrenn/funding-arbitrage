import ccxt from 'ccxt';
export class OkxExchange extends ccxt.pro.okex {
    constructor() {
        super(...arguments);
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, Object.assign(Object.assign({}, params), { ordType: 'conditional' }));
        };
        this.setRiskLimit = async (riskLimit, symbol) => {
        };
    }
    async createOrder(symbol, type, side, amount, price, params) {
        if (((params === null || params === void 0 ? void 0 : params.takeProfitPrice) || (params === null || params === void 0 ? void 0 : params.stopLossPrice))) {
            delete params.postOnly;
            delete params.timeInForce;
        }
        let market = this.market(symbol);
        if (market.margin && !market.swap) {
            params = Object.assign(Object.assign({}, params), { marginMode: 'isolated' });
        }
        return await super.createOrder(symbol, type, side, amount, price, params);
    }
    async setIsolationMode(isoMode, type) {
        return await this.privatePostAccountSetIsolatedMode({ isoMode, type });
    }
    async cancelAllOrders(...args) {
        let orders = await super.fetchOpenOrders(args[0]);
        for (let i = 0; i < orders.length; i++) {
            await super.cancelOrder(orders[i].id, args[0]);
        }
    }
    async fetchOrder(id, symbol, params) {
        let openParams = { ordType: 'conditional', algoId: id };
        const clientOrderId = this.safeString2(params, 'clOrdId', 'clientOrderId');
        if (clientOrderId)
            openParams['clOrdId'] = clientOrderId;
        try {
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1)
                return orders[0];
        }
        catch (err) {
            console.log(err);
        }
        try {
            openParams.ordType = "trigger";
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1)
                return orders[0];
        }
        catch (err) {
            console.log(err);
        }
        try {
            delete openParams.ordType;
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1)
                return orders[0];
        }
        catch (err) {
            console.log(err);
        }
        return await super.fetchOrder(id, symbol, params);
    }
}
//# sourceMappingURL=okx.js.map