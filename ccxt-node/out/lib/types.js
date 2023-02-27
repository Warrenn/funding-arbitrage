import ccxt from 'ccxt';
export class BinanceExchange extends ccxt.pro.binance {
    constructor() {
        super(...arguments);
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return this.fetchOpenOrders(symbol, since, limit, params);
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
export class GateExchange extends ccxt.pro.gateio {
    constructor() {
        super(...arguments);
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, Object.assign(Object.assign({}, params), { stop: true }));
        };
    }
    describe() {
        return this.deepExtend(super.describe(), {
            'urls': {
                'test': {
                    'public': {
                        'withdrawals': 'https://api.gateio.ws/api/v4',
                        'wallet': 'https://api.gateio.ws/api/v4',
                        'margin': 'https://api.gateio.ws/api/v4',
                        'spot': 'https://api.gateio.ws/api/v4',
                        'options': 'https://api.gateio.ws/api/v4',
                        'subAccounts': 'https://api.gateio.ws/api/v4',
                    },
                    'private': {
                        'withdrawals': 'https://api.gateio.ws/api/v4',
                        'wallet': 'https://api.gateio.ws/api/v4',
                        'margin': 'https://api.gateio.ws/api/v4',
                        'spot': 'https://api.gateio.ws/api/v4',
                        'options': 'https://api.gateio.ws/api/v4',
                        'subAccounts': 'https://api.gateio.ws/api/v4',
                    }
                }
            }
        });
    }
    async fetchOrder(id, symbol, params) {
        try {
            let order = await super.fetchOrder(id, symbol, params);
            if (order)
                return order;
        }
        catch (error) {
            console.log(error);
        }
        return await super.fetchOrder(id, symbol, Object.assign(Object.assign({}, params), { stop: true }));
    }
    async fetchPosition(symbol, params) {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }
}
export class BybitExchange extends ccxt.pro.bybit {
    constructor() {
        super(...arguments);
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        };
    }
}
export class CoinexExchange extends ccxt.pro.coinex {
    constructor() {
        super(...arguments);
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        };
    }
    async fetchPosition(symbol, params) {
        let position = await super.fetchPosition(symbol, params);
        if (position.contracts == undefined && !!position.contractSize) {
            position.contracts = parseFloat(position.contractSize);
            position.contractSize = 1;
        }
        return position;
    }
}
export class OkxExchange extends ccxt.pro.okex {
    constructor() {
        super(...arguments);
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, Object.assign(Object.assign({}, params), { ordType: 'conditional' }));
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
//# sourceMappingURL=types.js.map