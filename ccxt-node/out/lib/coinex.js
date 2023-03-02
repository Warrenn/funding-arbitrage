import ccxt from 'ccxt';
export class CoinexExchange extends ccxt.pro.coinex {
    constructor() {
        super(...arguments);
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        };
        this.setRiskLimit = async (riskLimit, symbol) => {
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
//# sourceMappingURL=coinex.js.map