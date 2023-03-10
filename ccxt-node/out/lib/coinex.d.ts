import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Order, Params, WithdrawalResponse } from 'ccxt';
export declare class CoinexExchange extends ccxt.pro.coinex {
    private positionIds;
    market(symbol: string): ccxt.Market;
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
    withdraw(currency: string, amount: number, address: string, tag?: string, params?: Params): Promise<WithdrawalResponse>;
    createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<Order>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    setRiskLimit: SetRiskLimitFunction;
    setLeverage(leverage: number, symbol?: string | undefined, params?: any): Promise<any>;
}
