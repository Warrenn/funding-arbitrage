import ccxt, { ExchangePro, Order } from 'ccxt';

export type GetPriceFunction = ({ side, bid, ask }: { side: Order["side"], bid: number, ask: number }) => number;
export type ExchangeFactory = ({ ssm, apiCredentialsKeyPrefix }: { ssm: AWS.SSM, apiCredentialsKeyPrefix: string }) => Promise<ccxt.ExchangePro>;
export type GetFuturesCalculationFunction = ({
    coin,
    coinGlassData,
    nextFundingHour,
    investment
}: {
    coin: string,
    coinGlassData: CoinGlassData,
    nextFundingHour: number,
    investment: number
}) => Promise<FuturesCalculation[] | undefined>

export type CreateOrderDetails = {
    exchange: ExchangePro,
    symbol: string,
    side: Order["side"],
    size: number,
    getPrice?: GetPriceFunction,
    reduceOnly?: boolean,
    stopLossPrice?: number,
    takeProfitPrice?: number,
    price?: number,
    positionId?: string,
    retryLimit?: number,
    immediate?: boolean
}

export type AdjustPositionDetails = {
    longExchange: ccxt.pro.Exchange,
    shortExchange: ccxt.pro.Exchange,
    longSymbol: string,
    shortSymbol: string,
    longSize: number;
    shortSize: number
    longOrderCount: number,
    shortOrderCount: number,
    trailingLong: number,
    trailingShort: number,
    makerSide: "long" | "short",
    trailPct?: number,
    reduceOnly?: boolean,
    shortSide?: Order["side"],
    longSide?: Order["side"]
}

export type TradeState = {
    fundingHour: number,
    longExchange: string,
    shortExchange: string,
    shortSymbol: string,
    longSymbol: string,
    positionSize: number,
    idealOrderSize: number,
    state: 'open' | 'filled' | 'closed',
    makerSide: 'long' | 'short'
}

export type FuturesCalculation = {
    exchange: string,
    symbol: string,
    rate: number,
    makerFee: number,
    takerFee: number,
    leverage: number,
    riskIndex: string
}

export type RoiTradePair = {
    roi: number,
    makerSide: 'long' | 'short',
    longExchange: string,
    shortExchange: string,
    longSymbol: string,
    shortSymbol: string,
    leverage: number
}

export type CoinGlassData = { [coin: string]: { [exchange: string]: number } }

export class binance2 extends ccxt.pro.binance {
    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, params);
    }
}

export class gate2 extends ccxt.pro.gateio {
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
            if (order) return order;
        }
        catch (error) {
            console.log(error);
        }

        return await super.fetchOrder(id, symbol, { ...params, stop: true });
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, { ...params, stop: true });
    }

    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }
}

export class bybit2 extends ccxt.pro.bybit {

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, params);
    }
}

export class coinex2 extends ccxt.pro.coinex {
    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let position = await super.fetchPosition(symbol, params);
        if (position.contracts == undefined && !!position.contractSize) {
            position.contracts = parseFloat(position.contractSize);
            position.contractSize = 1;
        }
        return position;
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, params);
    }
}

export class okx2 extends ccxt.pro.okex {
    async createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params) {
        if ((params?.takeProfitPrice || params?.stopLossPrice)) {
            delete params.postOnly;
            delete params.timeInForce;
        }
        return await super.createOrder(symbol, type, side, amount, price, params);
    }

    async cancelAllOrders(...args: any): Promise<any> {
        let orders = await super.fetchOpenOrders(args[0]);
        for (let i = 0; i < orders.length; i++) {
            await super.cancelOrder(orders[i].id, args[0]);
        }
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
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
}
