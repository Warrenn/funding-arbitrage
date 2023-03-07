import ccxt, { ExchangePro } from 'ccxt';
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
export declare function getSettings({ ssm, settingsPrefix }: {
    ssm: AWS.SSM;
    settingsPrefix: string;
}): Promise<any>;
export declare const exchangeFactory: {
    [key: string]: ExchangeFactory;
};
export declare function sandBoxFundingRateLink(fundingRates: FundingRates, nextFundingHour: number): Promise<FundingRates>;
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
    calculatedLeverage: number;
    tier: LeverageTier;
};
export declare function processFundingRatesPipeline(processinglinks: FundingRatesChainFunction[]): ({ nextFundingHour }: {
    nextFundingHour: number;
}) => Promise<FundingRates>;
export declare function calculateBestRoiTradingPairs({ exchangeCache, investment, referenceData, fundingRates, minThreshold, }: {
    fundingRates: FundingRates;
    minThreshold?: number;
    exchangeCache: {
        [exchange: string]: ExchangePro;
    };
    investment: number;
    referenceData: TradePairReferenceData;
}): Promise<RoiTradePair[]>;
export declare function sizeOfCloseOrdersPlaced({ exchange, symbol, triggerType }: {
    exchange: ccxt.ExchangePro;
    symbol: string;
    triggerType: 'sl' | 'tp';
}): Promise<number>;
export declare function sizeOfTakeProfitOrders(params: {
    exchange: ccxt.ExchangePro;
    symbol: string;
}): Promise<number>;
export declare function sizeOfStopLossOrders(params: {
    exchange: ccxt.ExchangePro;
    symbol: string;
}): Promise<number>;
export declare function createOrder({ exchange, symbol, side, size, price, getPrice, reduceOnly, stopLossPrice, takeProfitPrice, positionId, immediate }: CreateOrderDetails): Promise<ccxt.Order>;
export declare function createImmediateOrder(params: CreateOrderDetails): Promise<ccxt.Order>;
export declare function calculateLiquidationPrice({ exchange, market, position }: {
    exchange: ccxt.pro.Exchange;
    market: ccxt.Market;
    position: any;
}): Promise<number>;
export declare function createSlOrders({ longExchange, longSymbol, shortExchange, shortSymbol, limit, trigger }: {
    longExchange: ccxt.pro.Exchange;
    shortExchange: ccxt.pro.Exchange;
    longSymbol: string;
    shortSymbol: string;
    limit: number;
    trigger: number;
}): Promise<void>;
export declare function createTpOrders({ longExchange, longSymbol, shortExchange, shortSymbol, limit, trigger }: {
    longExchange: ccxt.pro.Exchange;
    shortExchange: ccxt.pro.Exchange;
    longSymbol: string;
    shortSymbol: string;
    limit: number;
    trigger: number;
}): Promise<void>;
export declare function getPositionSize({ exchange, symbol }: {
    exchange: ccxt.ExchangePro;
    symbol: string;
}): Promise<number>;
export declare function closePositions(params: AdjustPositionDetails): Promise<void>;
export declare function openPositions(params: AdjustPositionDetails): Promise<void>;
export declare function adjustUntilTargetMet({ target, getPositionSize, createOrder, idealSize, contractSize, maxSize, minSize, direction, sleepTimeout, retryLimit }: {
    target: number;
    getPositionSize: () => Promise<number>;
    createOrder: (orderSize: number) => Promise<any>;
    idealSize: number;
    contractSize: number;
    maxSize: number;
    minSize: number;
    direction?: 'up' | 'down';
    sleepTimeout?: number;
    retryLimit?: number;
}): Promise<void>;
export declare function adjustPositions({ longExchange, longSymbol, shortExchange, shortSymbol, makerSide, reduceOnly, idealOrderValue, idealBatchSize, targetSize, shortSide, longSide, trailPct }: AdjustPositionDetails): Promise<void>;
