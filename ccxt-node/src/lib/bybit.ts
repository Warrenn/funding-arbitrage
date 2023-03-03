import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt from 'ccxt';
const ignoreErrorCodes: {
    [errorCode: string]: {
        [message: string]: any
    }
} = {
    '10001': { 'risk limit not modified': {} },
    '10016': { 'Cancel All No Result': {} },
    '110043': { 'leverage not modified': {} },
    '110017': { 'current position is zero, cannot fix reduce-only order qty': {} },
};
export class BybitExchange extends ccxt.pro.bybit {

    handleErrors(httpCode: any, reason: any, url: any, method: any, headers: any, body: any, response: any, requestHeaders: any, requestBody: any) {
        if (!response) return;
        const errorCode = this.safeString2(response, 'ret_code', 'retCode');
        const retMsg = this.safeString2(response, 'ret_msg', 'retMsg');

        if (errorCode && retMsg && (errorCode in ignoreErrorCodes) && (retMsg in ignoreErrorCodes[errorCode])) return ignoreErrorCodes[errorCode][retMsg];
        return super.handleErrors(httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody);
    }

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {
            let market = this.market(symbol);

            const response = await this.privatePostUnifiedV3PrivatePositionSetRiskLimit({
                category: "linear",
                symbol: market.id,
                riskId: riskLimit
            });
            return response;
        }
}
