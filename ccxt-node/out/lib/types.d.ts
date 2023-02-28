import ccxt, { ExchangePro, Order } from 'ccxt';
export declare type MakerSide = 'long' | 'short';
export declare type SymbolType = 'quote' | 'base';
export declare type GetPriceFunction = ({ side, bid, ask }: {
    side: Order["side"];
    bid: number;
    ask: number;
}) => number;
export declare type ExchangeFactory = ({ ssm, apiCredentialsKeyPrefix }: {
    ssm: AWS.SSM;
    apiCredentialsKeyPrefix: string;
}) => Promise<ccxt.ExchangePro>;
export declare type FetchOpenStopOrdersFunction = (symbol: string, since?: number, limit?: number, params?: ccxt.Params) => Promise<ccxt.Order[]>;
export declare type FundingRatesChainFunction = (fundingRates: FundingRates, nextFundingHour: number) => Promise<FundingRates>;
export declare type TradePairReferenceData = {
    [coin: string]: {
        [exchange: string]: {
            [tradePair: string]: {
                makerFee: number;
                takerFee: number;
                riskLevels: {
                    type: SymbolType;
                    contractSize?: number;
                    levels: LeverageTier[];
                };
            };
        };
    };
};
export declare type CreateOrderDetails = {
    exchange: ExchangePro;
    symbol: string;
    side: Order["side"];
    size: number;
    getPrice?: GetPriceFunction;
    reduceOnly?: boolean;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    price?: number;
    positionId?: string;
    retryLimit?: number;
    immediate?: boolean;
};
export declare type AdjustPositionDetails = {
    longExchange: ccxt.pro.Exchange;
    shortExchange: ccxt.pro.Exchange;
    longSymbol: string;
    shortSymbol: string;
    longSize: number;
    shortSize: number;
    longOrderCount: number;
    shortOrderCount: number;
    trailingLong: number;
    trailingShort: number;
    makerSide: MakerSide;
    trailPct?: number;
    reduceOnly?: boolean;
    shortSide?: Order["side"];
    longSide?: Order["side"];
};
export declare type TradeState = {
    fundingHour: number;
    longExchange: string;
    shortExchange: string;
    shortSymbol: string;
    longSymbol: string;
    positionSize: number;
    idealOrderSize: number;
    state: 'open' | 'filled' | 'closed';
    makerSide: MakerSide;
};
export declare type FundingRateCalculation = {
    exchange: string;
    symbol: string;
    rate: number;
    makerFee: number;
    takerFee: number;
    calculatedLeverage: number;
    maxLeverage: number;
    riskIndex?: string;
};
export declare type RoiTradePair = {
    roi: number;
    makerSide: MakerSide;
    longExchange: string;
    shortExchange: string;
    longSymbol: string;
    shortSymbol: string;
    longRiskIndex?: string;
    shortRiskIndex?: string;
    longMaxLeverage: number;
    shortMaxLeverage: number;
    leverage: number;
};
export declare type LeverageTier = {
    maxLeverage: number;
    maxNotional: number;
    tier: number;
    currency: string;
    minNotional: number;
    maintenanceMarginRate: number;
    info: any;
};
export declare type FundingRates = {
    [coin: string]: {
        [exchange: string]: {
            [pair: string]: number;
        };
    };
};
export declare class BinanceExchange extends ccxt.pro.binance {
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params): Promise<Order>;
    createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<Order>;
    fetchOpenOrders(symbol?: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
}
export declare class GateExchange extends ccxt.pro.gateio {
    describe(): any;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
}
export declare class BybitExchange extends ccxt.pro.bybit {
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
}
export declare class CoinexExchange extends ccxt.pro.coinex {
    fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
}
export declare class OkxExchange extends ccxt.pro.okex {
    createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params): Promise<ccxt.Order>;
    setIsolationMode(isoMode: string, type: string): Promise<any>;
    cancelAllOrders(...args: any): Promise<any>;
    fetchOpenStopOrders: FetchOpenStopOrdersFunction;
    fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order>;
}
