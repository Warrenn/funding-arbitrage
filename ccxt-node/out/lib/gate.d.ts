import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Balances, Params } from 'ccxt';
export declare class GateExchange extends ccxt.pro.gateio {
    describe(): any;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order>;
    fetchBalance(params?: Params): Promise<Balances>;
    setRiskLimit: SetRiskLimitFunction;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
}
