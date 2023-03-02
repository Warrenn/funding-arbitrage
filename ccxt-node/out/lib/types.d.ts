import ccxt, { ExchangePro, Order } from 'ccxt';
export declare type MakerSide = 'long' | 'short';
export declare type SymbolType = 'quote' | 'base';
export declare type SetRiskLimitFunction = (riskIndex: number, symbol: string) => Promise<any>;
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
export declare type IdealTradeSizes = {
    [symbol: string]: {
        idealSize: number;
        batchSize: number;
    };
};
export declare type Settings = {
    trailPct: number;
    investmentMargin: number;
    initialMargin: number;
    tpSlLimit: number;
    tpSlTrigger: number;
    onBoardingHours: number;
    fundingHourlyFreq: number;
};
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
    makerSide: MakerSide;
    idealTradeSizes: IdealTradeSizes;
    shortSide?: Order["side"];
    longSide?: Order["side"];
    trailPct?: number;
    orderSize?: number;
    reduceOnly?: boolean;
};
export declare type TradeState = {
    fundingHour: number;
    longExchange: string;
    shortExchange: string;
    longSymbol: string;
    shortSymbol: string;
    orderSize: number;
    state: 'open' | 'filled' | 'closed';
    makerSide: MakerSide;
    longRiskIndex: number;
    shortRiskIndex: number;
    longMaxLeverage: number;
    shortMaxLeverage: number;
    leverage: number;
};
export declare type FundingRateCalculation = {
    exchange: string;
    symbol: string;
    rate: number;
    makerFee: number;
    takerFee: number;
    calculatedLeverage: number;
    maxLeverage: number;
    riskIndex: number;
};
export declare type RoiTradePair = {
    roi: number;
    makerSide: MakerSide;
    longExchange: string;
    shortExchange: string;
    longSymbol: string;
    shortSymbol: string;
    longRiskIndex: number;
    shortRiskIndex: number;
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
