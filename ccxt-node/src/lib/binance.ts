import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Order } from 'ccxt';


export class BinanceExchange extends ccxt.pro.binance {
    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }

    async fetchOrder(id: string, symbol: string, params?: ccxt.Params): Promise<Order> {
        let market = this.market(symbol);
        if (market.margin && !market.swap) params = { ...params, marginMode: 'isolated' };
        return super.fetchOrder(id, symbol, params);
    }

    async createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<Order> {
        let market = this.market(symbol);
        if (market.margin && !market.swap) params = { ...params, marginMode: 'isolated' };
        return super.createOrder(symbol, type, side, amount, price, params);
    }

    async fetchOpenOrders(symbol?: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        if (symbol) {
            let market = this.market(symbol);
            if (market.margin && !market.swap) params = { ...params, marginMode: 'isolated' };
        }
        return super.fetchOpenOrders(symbol, since, limit, params);
    };

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return this.fetchOpenOrders(symbol, since, limit, params);
        }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {

        }
}