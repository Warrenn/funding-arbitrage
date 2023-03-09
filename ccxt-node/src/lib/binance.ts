import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Balances, Order, Params } from 'ccxt';


export class BinanceExchange extends ccxt.pro.binance {
    private fetchingDeposits: boolean = false;

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
    }

    async fetchDeposits(code = undefined, since = undefined, limit = undefined, params = {}) {
        this.fetchingDeposits = true;
        const response = await super.fetchDeposits(code, since, limit, params);
        this.fetchingDeposits = false;
        return response;
    }

    parseTransaction(transaction: any, currency = undefined) {
        if (this.fetchingDeposits) {
            transaction = { transactionType: '0', ...transaction };
        }
        return super.parseTransaction(transaction, currency);
    }

    async fetchBalance(params?: Params): Promise<Balances> {
        if (params?.type === this.options.fundingAccount) {
            const response = await this['sapiV3PostAssetGetUserAsset']({});
            return this.parseBalance(response, 'funding', '');
        }
        if (params?.type === this.options.tradingAccount) {
            let defaultMarginMode = this.options.defaultMarginMode;
            this.options.defaultMarginMode = '';
            const response = await super.fetchBalance(params);
            this.options.defaultMarginMode = defaultMarginMode;
            return response;
        }
        return super.fetchBalance(params);
    }

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return this.fetchOpenOrders(symbol, since, limit, params);
        }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {

        }
}