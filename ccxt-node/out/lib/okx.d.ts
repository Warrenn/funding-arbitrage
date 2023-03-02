import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Order } from 'ccxt';
export declare class OkxExchange extends ccxt.pro.okex {
    createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<ccxt.Order>;
    setIsolationMode(isoMode: string, type: string): Promise<any>;
    cancelAllOrders(...args: any): Promise<any>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order>;
    setRiskLimit: SetRiskLimitFunction;
}
