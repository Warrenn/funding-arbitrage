import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt from 'ccxt';
export declare class GateExchange extends ccxt.pro.gateio {
    describe(): any;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order>;
    setRiskLimit: SetRiskLimitFunction;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
}
