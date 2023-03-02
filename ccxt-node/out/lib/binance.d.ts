import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Order } from 'ccxt';
export declare class BinanceExchange extends ccxt.pro.binance {
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params): Promise<Order>;
    createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<Order>;
    fetchOpenOrders(symbol?: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    setRiskLimit: SetRiskLimitFunction;
}
