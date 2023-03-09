import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Balances, Params } from 'ccxt';

export class GateExchange extends ccxt.pro.gateio {
    describe() {
        return this.deepExtend(super.describe(), {
            'urls': {
                'test': {
                    'public': {
                        'withdrawals': 'https://api.gateio.ws/api/v4',
                        'wallet': 'https://api.gateio.ws/api/v4',
                        'margin': 'https://api.gateio.ws/api/v4',
                        'spot': 'https://api.gateio.ws/api/v4',
                        'options': 'https://api.gateio.ws/api/v4',
                        'subAccounts': 'https://api.gateio.ws/api/v4',
                    },
                    'private': {
                        'withdrawals': 'https://api.gateio.ws/api/v4',
                        'wallet': 'https://api.gateio.ws/api/v4',
                        'margin': 'https://api.gateio.ws/api/v4',
                        'spot': 'https://api.gateio.ws/api/v4',
                        'options': 'https://api.gateio.ws/api/v4',
                        'subAccounts': 'https://api.gateio.ws/api/v4',
                    }
                }
            }
        });
    }

    async fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order> {
        try {
            let order = await super.fetchOrder(id, symbol, params);
            if (order?.status) return order;
        }
        catch (error) {
            console.log(error);
        }

        return await super.fetchOrder(id, symbol, { ...params, stop: true });
    }

    async fetchBalance(params?: Params): Promise<Balances> {
        if (params?.type === this.options.fundingAccount ||
            params?.type === this.options.tradingAccount) {
            let defaultMarginMode = this.options.defaultMarginMode;
            this.options.defaultMarginMode = '';
            const response = await super.fetchBalance(params);
            this.options.defaultMarginMode = defaultMarginMode;
            return response;
        }
        return super.fetchBalance(params);
    }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {
            let market = this.market(symbol);
            const [request, query] = this.prepareRequest(market, undefined, {});
            request["risk_limit"] = riskLimit.toString();
            const response = await this['privateFuturesPostSettlePositionsContractRiskLimit'](this.extend(request, query));
            return response;
        }

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return super.fetchOpenOrders(symbol, since, limit, { ...params, stop: true });
        }

    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }
}
