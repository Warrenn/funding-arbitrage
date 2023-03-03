import ccxt from 'ccxt';
const ignoreErrorCodes = {
    '10001': { 'risk limit not modified': {} },
    '10016': { 'Cancel All No Result': {} },
    '110043': { 'leverage not modified': {} },
    '110017': { 'current position is zero, cannot fix reduce-only order qty': {} },
};
export class BybitExchange extends ccxt.pro.bybit {
    constructor() {
        super(...arguments);
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
        const retMsg = this.safeString2(response, 'ret_msg', 'retMsg');
        if (errorCode && retMsg && (errorCode in ignoreErrorCodes) && (retMsg in ignoreErrorCodes[errorCode]))
            return ignoreErrorCodes[errorCode][retMsg];
        return super.handleErrors(httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody);
    }
}
//# sourceMappingURL=bybit.js.map