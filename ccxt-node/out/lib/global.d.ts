import ccxt, { ExchangePro, Order } from 'ccxt';
import AWS from 'aws-sdk';
import { ExchangeFactory, AdjustPositionDetails, FundingRates, CreateOrderDetails, FundingRateCalculation, LeverageTier, RoiTradePair, TradeState, FundingRatesChainFunction, TradePairReferenceData } from './types.js';
export declare function getCredentials({ ssm, name, apiCredentialsKeyPrefix }: {
    ssm: AWS.SSM;
    name: string;
    apiCredentialsKeyPrefix: string;
}): Promise<any>;
export declare function getCoinglassSecret({ ssm, coinglassSecretKey }: {
    ssm: AWS.SSM;
    coinglassSecretKey: string;
}): Promise<string>;
export declare function saveTradeState({ ssm, state, tradeStatusKey }: {
    ssm: AWS.SSM;
    state: TradeState;
    tradeStatusKey: string;
}): Promise<any>;
export declare function getTradeState({ ssm, tradeStatusKey }: {
    ssm: AWS.SSM;
    tradeStatusKey: string;
}): Promise<any>;
export declare const factory: {
    [key: string]: ExchangeFactory;
};
export declare function getCoinGlassData({ ssm, coinglassSecretKey }: {
    ssm: AWS.SSM;
    coinglassSecretKey: string;
}): Promise<FundingRatesChainFunction>;
export declare function calculateRoi({ calculation1, calculation2, investment }: {
    calculation1: FundingRateCalculation;
    calculation2: FundingRateCalculation;
    investment: number;
}): RoiTradePair;
export declare function calculateMaxLeverage({ investment, leverageTiers, contractSize, currentPrice }: {
    investment: number;
    leverageTiers: LeverageTier[];
    contractSize?: number;
    currentPrice?: number;
}): {
    maxLeverage: number;
    tier: LeverageTier;
};
export declare function processFundingRatesPipeline(processinglinks: FundingRatesChainFunction[]): ({ nextFundingHour }: {
    nextFundingHour: number;
}) => Promise<FundingRates>;
export declare function calculateBestRoiTradingPairs({ minThreshold, exchangeCache, investment, referenceData, fundingRates }: {
    fundingRates: FundingRates;
    minThreshold?: number;
    exchangeCache: {
        [exchange: string]: ExchangePro;
    };
    investment: number;
    referenceData: TradePairReferenceData;
}): Promise<RoiTradePair[]>;
export declare function getPositionSize(position: any | undefined): number;
export declare function openBuyOrdersSize(params: {
    exchange: ccxt.ExchangePro;
    symbol: string;
    position: any;
}): Promise<number>;
export declare function openSellOrdersSize(params: {
    exchange: ccxt.ExchangePro;
    symbol: string;
    position: any;
}): Promise<number>;
export declare function openOrdersSize({ exchange, position, symbol, side }: {
    exchange: ccxt.ExchangePro;
    symbol: string;
    position: any;
    side: Order['side'];
}): Promise<number>;
export declare function remainingToClose({ exchange, position, symbol, triggerType }: {
    exchange: ccxt.ExchangePro;
    position: any;
    symbol: string;
    triggerType: 'sl' | 'tp';
}): Promise<number>;
export declare function remainingTakeProfit(params: {
    exchange: ccxt.ExchangePro;
    position: any;
    symbol: string;
}): Promise<number>;
export declare function remainingStopLoss(params: {
    exchange: ccxt.ExchangePro;
    position: any;
    symbol: string;
}): Promise<number>;
export declare function calculateOrderSizes({ shortMarket, longMarket, longRequirement, shortRequirement, idealOrderSize }: {
    shortMarket: ccxt.Market;
    longMarket: ccxt.Market;
    shortRequirement: number;
    longRequirement: number;
    idealOrderSize: number;
}): {
    longSize: number;
    shortSize: number;
    longOrderCount: number;
    shortOrderCount: number;
    trailingLong: number;
    trailingShort: number;
};
export declare function blockUntilOscillates({ exchange, symbol, oscillationLimit, timeout }: {
    exchange: ExchangePro;
    symbol: string;
    oscillationLimit?: number;
    timeout?: number;
}): Promise<"up" | "down" | null>;
export declare function createLimitOrder({ exchange, symbol, side, size, price, getPrice, reduceOnly, stopLossPrice, takeProfitPrice, positionId, retryLimit, immediate }: CreateOrderDetails): Promise<ccxt.Order>;
export declare function blockUntilClosed({ exchange, symbol, orderId, diffPct, retryLimit, timeout }: {
    exchange: ExchangePro;
    symbol: string;
    orderId: string;
    diffPct?: number;
    retryLimit?: number;
    timeout?: number;
}): Promise<"closed" | "error" | "high" | "low">;
export declare function createImmediateOrder(params: CreateOrderDetails): Promise<ccxt.Order>;
export declare function calculateLiquidationPrice({ exchange, market, position }: {
    exchange: ccxt.pro.Exchange;
    market: ccxt.Market;
    position: any;
}): Promise<number>;
export declare function createSlOrders({ longExchange, longMarket, longOrderCount, longPosition, longSize, longSymbol, shortExchange, shortMarket, shortOrderCount, shortPosition, shortSize, shortSymbol, trailingLong, trailingShort, limit, trigger }: {
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
    longMarket: ccxt.Market;
    shortMarket: ccxt.Market;
    longPosition: any;
    shortPosition: any;
    limit: number;
    trigger: number;
}): Promise<void>;
export declare function createTpOrders({ longExchange, longMarket, longOrderCount, longPosition, longSize, longSymbol, shortExchange, shortMarket, shortOrderCount, shortPosition, shortSize, shortSymbol, trailingLong, trailingShort, limit, trigger }: {
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
    longMarket: ccxt.Market;
    shortMarket: ccxt.Market;
    longPosition: any;
    shortPosition: any;
    limit: number;
    trigger: number;
}): Promise<void>;
export declare function trailOrder({ exchange, orderId, symbol, trailPct, retryLimit }: {
    exchange: ExchangePro;
    orderId: string;
    symbol: string;
    trailPct: number;
    retryLimit?: number;
}): Promise<void>;
export declare function closePositions(params: AdjustPositionDetails): Promise<void>;
export declare function openPositions(params: AdjustPositionDetails): Promise<void>;
export declare function adjustPositions({ longExchange, longSymbol, shortExchange, shortSymbol, longSize, longOrderCount, shortOrderCount, shortSize, trailingLong, trailingShort, makerSide, trailPct, shortSide, longSide, reduceOnly }: AdjustPositionDetails): Promise<void>;
