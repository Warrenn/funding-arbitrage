import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Order } from 'ccxt';

export class OkxExchange extends ccxt.pro.okex {
    async createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params) {
        if ((params?.takeProfitPrice || params?.stopLossPrice)) {
            delete params.postOnly;
            delete params.timeInForce;
        }
        let market = this.market(symbol);
        if (market.margin && !market.swap) {
            params = { ...params, marginMode: 'isolated' };
        }
        return await super.createOrder(symbol, type, side, amount, price, params);
    }

    async setIsolationMode(isoMode: string, type: string): Promise<any> {
        return await this.privatePostAccountSetIsolatedMode({ isoMode, type });
    }

    async cancelAllOrders(...args: any): Promise<any> {
        let orders = await super.fetchOpenOrders(args[0]);
        for (let i = 0; i < orders.length; i++) {
            await super.cancelOrder(orders[i].id, args[0]);
        }
    }

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return super.fetchOpenOrders(symbol, since, limit, { ...params, ordType: 'conditional' });
        }

    async fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order> {
        let openParams: any = { ordType: 'conditional', algoId: id };
        const clientOrderId = this.safeString2(params, 'clOrdId', 'clientOrderId');
        if (clientOrderId) openParams['clOrdId'] = clientOrderId;

        try {
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1) return orders[0];
        } catch (err) {
            console.log(err);
        }

        try {
            openParams.ordType = "trigger";
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1) return orders[0];
        } catch (err) {
            console.log(err);
        }

        try {
            delete openParams.ordType;
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1) return orders[0];
        } catch (err) {
            console.log(err);
        }

        return await super.fetchOrder(id, symbol, params);
    }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {

        }
}