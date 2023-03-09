import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Balances, Params } from 'ccxt';
export declare class BybitExchange extends ccxt.pro.bybit {
    describe(): any;
    handleErrors(httpCode: any, reason: any, url: any, method: any, headers: any, body: any, response: any, requestHeaders: any, requestBody: any): any;
    parseFundingBalance(response: any): any;
    fetchBalance(params?: Params): Promise<Balances>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    setRiskLimit: SetRiskLimitFunction;
}
