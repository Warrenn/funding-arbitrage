import ccxt from 'ccxt';
export class GateExchange extends ccxt.pro.gateio {
    constructor() {
        super(...arguments);
        this.setRiskLimit = async (riskLimit, symbol) => {
            let market = this.market(symbol);
            const [request, query] = this.prepareRequest(market, undefined, {});
            request["risk_limit"] = riskLimit.toString();
            const response = await this['privateFuturesPostSettlePositionsContractRiskLimit'](this.extend(request, query));
            return response;
        };
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
//# sourceMappingURL=gate.js.map