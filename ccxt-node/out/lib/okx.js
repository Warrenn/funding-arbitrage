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
    async withdraw(currency, amount, address, tag, params) {
        params = Object.assign(Object.assign({}, params), { pwd: this.password });
        return await super.withdraw(currency, amount, address, tag, params);
    }
    async cancelAllOrders(...args) {
        let orders = await super.fetchOpenOrders(args[0]);
        for (let i = 0; i < orders.length; i++) {
            await super.cancelOrder(orders[i].id, args[0]);
        }
    }
    async fetchOrder(id, symbol, params) {
        try {
            let order = await super.fetchOrder(id, symbol, params);
            if (order === null || order === void 0 ? void 0 : order.status)
                return order;
        }
        catch (err) {
            console.log(err);
        }
        let openParams = Object.assign(Object.assign({}, params), { ordType: 'conditional', algoId: id });
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
            throw err;
        }
        return await super.fetchOrder(id, symbol);
    }
    async setLeverage(leverage, symbol = undefined, params = {}) {
        /**
         * @method
         * @name okx#setLeverage
         * @description set the level of leverage for a market
         * @see https://www.okx.com/docs-v5/en/#rest-api-account-set-leverage
         * @param {float} leverage the rate of leverage
         * @param {string} symbol unified market symbol
         * @param {object} params extra parameters specific to the okx api endpoint
         * @param {string} params.marginMode 'cross' or 'isolated'
         * @param {string|undefined} params.posSide 'long' or 'short' for isolated margin long/short mode on futures and swap markets
         * @returns {object} response from the exchange
         */
        if (symbol === undefined) {
            throw new ccxt.ArgumentsRequired(this.id + ' setLeverage() requires a symbol argument');
        }
        // WARNING: THIS WILL INCREASE LIQUIDATION PRICE FOR OPEN ISOLATED LONG POSITIONS
        // AND DECREASE LIQUIDATION PRICE FOR OPEN ISOLATED SHORT POSITIONS
        if ((leverage < 1) || (leverage > 125)) {
            throw new ccxt.BadRequest(this.id + ' setLeverage() leverage should be between 1 and 125');
        }
        await this.loadMarkets();
        const market = this.market(symbol);
        let marginMode = undefined;
        [marginMode, params] = this.handleMarginModeAndParams('setLeverage', params);
        if (marginMode === undefined) {
            marginMode = this.safeString(params, 'mgnMode', 'cross'); // cross as default marginMode
        }
        if ((marginMode !== 'cross') && (marginMode !== 'isolated')) {
            throw new ccxt.BadRequest(this.id + ' setLeverage() requires a marginMode parameter that must be either cross or isolated');
        }
        const request = {
            'lever': leverage,
            'mgnMode': marginMode,
            'instId': market['id'],
        };
        const response = await this.privatePostAccountSetLeverage(this.extend(request, params));
        return response;
    }
}
//# sourceMappingURL=okx.js.map