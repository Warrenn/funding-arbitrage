import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt from 'ccxt';

export class BybitExchange extends ccxt.pro.bybit {

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {
            const response = await this.privatPostUnifiedV3PrivatePositionSetRiskLimit({
                category: "linear",
                symbol,
                riskId: riskLimit
            });
            return response;
        }
}
