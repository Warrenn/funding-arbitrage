import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt from 'ccxt';
export declare class CoinexExchange extends ccxt.pro.coinex {
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    setRiskLimit: SetRiskLimitFunction;
}
