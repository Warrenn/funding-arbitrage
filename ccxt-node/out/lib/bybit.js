import ccxt from 'ccxt';
export class BybitExchange extends ccxt.pro.bybit {
    constructor() {
        super(...arguments);
        this.ignoreErrorCodes = ['10001', '110043'];
        this.fetchOpenStopOrders = async (symbol, since, limit, params) => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        };
        this.setRiskLimit = async (riskLimit, symbol) => {
            let market = this.market(symbol);
            const response = await this.privatePostUnifiedV3PrivatePositionSetRiskLimit({
                category: "linear",
                symbol: market.id,
                riskId: riskLimit
            });
            return response;
        };
    }
    handleErrors(httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        if (!response)
            return;
        const errorCode = this.safeString2(response, 'ret_code', 'retCode');
        if (this.ignoreErrorCodes.indexOf(errorCode) > -1)
            return {};
        return super.handleErrors(httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody);
    }
}
//# sourceMappingURL=bybit.js.map