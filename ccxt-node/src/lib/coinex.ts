import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Order } from 'ccxt';

export class CoinexExchange extends ccxt.pro.coinex {
    private positionIds: { [symbol: string]: string } = {};

    public market(symbol: string): ccxt.Market {
        let market = super.market(symbol);
        if (!market.limits.amount?.max) market.limits.amount = { max: 9999, min: market.limits.amount?.min };
        return market;
    }

    public async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let position = await super.fetchPosition(symbol, params);
        if (position.contracts == undefined && !!position.contractSize) {
            position.contracts = parseFloat(position.contractSize);
            position.contractSize = 1;
        }
        if (!(symbol in this.positionIds) && position.id) {
            this.positionIds[symbol] = position.id;
        }
        return position;
    }

    public async createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<Order> {
        if (params?.reduceOnly && !params?.positionId) {
            if (!(symbol in this.positionIds)) await this.fetchPosition(symbol);
            params = { ...params, positionId: this.positionIds[symbol] };
        }
        return super.createOrder(symbol, type, side, amount, price, params);
    }

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {

        }

    public async setLeverage(leverage: number, symbol: string | undefined = undefined, params: any = {}): Promise<any> {
        try {
            return await super.setLeverage(leverage, symbol, params);
        }
        catch (err: any) {
            if (('name' in err) &&
                ('message' in err) &&
                err.name === 'ExchangeError' &&
                err.message == 'order exist'
            ) {
                console.log(err);
                return {};
            }
            throw err;
        }
    }
}