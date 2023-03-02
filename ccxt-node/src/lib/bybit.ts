import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt from 'ccxt';

export class BybitExchange extends ccxt.pro.bybit {
    private ignoreErrorCodes: string[] = ['10001', '110043'];

    handleErrors(httpCode: any, reason: any, url: any, method: any, headers: any, body: any, response: any, requestHeaders: any, requestBody: any) {
        if (!response) return;
        const errorCode = this.safeString2(response, 'ret_code', 'retCode');
        if (this.ignoreErrorCodes.indexOf(errorCode) > -1) return {};
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
