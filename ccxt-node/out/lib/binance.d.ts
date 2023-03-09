import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Balances, Order, Params } from 'ccxt';
export declare class BinanceExchange extends ccxt.pro.binance {
    private fetchingDeposits;
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params): Promise<Order>;
    createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<Order>;
    fetchOpenOrders(symbol?: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]>;
    fetchDeposits(code?: undefined, since?: undefined, limit?: undefined, params?: {}): Promise<ccxt.Transaction[]>;
    parseTransaction(transaction: any, currency?: undefined): any;
    fetchBalance(params?: Params): Promise<Balances>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    setRiskLimit: SetRiskLimitFunction;
}
