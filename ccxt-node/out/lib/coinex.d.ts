import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Order } from 'ccxt';
export declare class CoinexExchange extends ccxt.pro.coinex {
    private positionIds;
    market(symbol: string): ccxt.Market;
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
    createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<Order>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    setRiskLimit: SetRiskLimitFunction;
}
