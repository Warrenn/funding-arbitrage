import { setTimeout as asyncSleep } from 'timers/promises';
import ccxt, { ExchangePro, Order, Transaction } from 'ccxt';
import AWS from 'aws-sdk';

import {
    ExchangeFactory,
    AdjustPositionDetails,
    FundingRates,
    CreateOrderDetails,
    FundingRateCalculation,
    LeverageTier,
    MakerSide,
    RoiTradePair,
    TradeState,
    FundingRatesChainFunction,
    TradePairReferenceData,
    FetchOpenStopOrdersFunction
} from './types.js';
import { BinanceExchange } from './binance.js';
import { OkxExchange } from './okx.js';
import { BybitExchange } from './bybit.js';
import { GateExchange } from './gate.js';
import { CoinexExchange } from './coinex.js';

export async function getCredentials({ ssm, name, apiCredentialsKeyPrefix }: { ssm: AWS.SSM, name: string, apiCredentialsKeyPrefix: string }): Promise<any> {
    let ssmParam = await ssm.getParameter({ Name: `${apiCredentialsKeyPrefix}${name}`, WithDecryption: true }).promise();
    return JSON.parse(`${ssmParam.Parameter?.Value}`);
}

export async function getCoinglassSecret({ ssm, coinglassSecretKey }: { ssm: AWS.SSM, coinglassSecretKey: string }): Promise<string> {
    let ssmParam = await ssm.getParameter({ Name: coinglassSecretKey, WithDecryption: true }).promise();
    return ssmParam.Parameter?.Value || "";
}

export async function saveTradeState({ ssm, state, tradeStatusKey }: { ssm: AWS.SSM, state: TradeState, tradeStatusKey: string }): Promise<any> {
    let jsonValue = JSON.stringify(state, undefined, 3);
    return ssm.putParameter({ Name: tradeStatusKey, Value: jsonValue, Overwrite: true }).promise();
}

export async function getTradeState({ ssm, tradeStatusKey }: { ssm: AWS.SSM, tradeStatusKey: string }): Promise<any> {
    let ssmParam = await ssm.getParameter({ Name: `${tradeStatusKey}` }).promise();
    return JSON.parse(`${ssmParam.Parameter?.Value}`);
}

export async function getSettings({ ssm, settingsPrefix }: { ssm: AWS.SSM, settingsPrefix: string }): Promise<any> {
    let ssmParam = await ssm.getParameter({ Name: `${settingsPrefix}` }).promise();
    return JSON.parse(`${ssmParam.Parameter?.Value}`);
}

export const exchangeFactory: { [key: string]: ExchangeFactory } = {
    "binance": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "binance", apiCredentialsKeyPrefix });
        let ex = new BinanceExchange({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: {
                fetchOrderBookLimit: 5,
                'recvWindow': 59999,
                defaultMarginMode: 'isolated',
                fundingAccount: 'spot',
                tradingAccount: 'future',
                leaveBehind: 1
            }
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        await ex.loadMarkets();
        return ex;
    },
    "okx": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "okx", apiCredentialsKeyPrefix });
        let ex = new OkxExchange({
            secret: credentials.secret,
            apiKey: credentials.key,
            password: credentials.password,
            nonce: () => new Date((new Date()).toUTCString()).getTime(),
            enableRateLimit: true,
            options: {
                'fetchTimeOffsetBeforeAuth': true,
                'recvWindow': 59999,
                fetchOrderBookLimit: 5,
                defaultMarginMode: 'isolated',
                fundingAccount: 'funding',
                tradingAccount: 'trading',
                withdrawalFee: 1,
                leaveBehind: 1

            },
            timeout: 99999
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        await ex.loadMarkets();
        return ex;
    },
    "bybit": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "bybit", apiCredentialsKeyPrefix });
        let ex = new BybitExchange({
            secret: credentials.secret,
            options: {
                'fetchTimeOffsetBeforeAuth': true,
                'recvWindow': 59999,
                fetchOrderBookLimit: 5,
                defaultMarginMode: 'isolated',
                fundingAccount: 'funding',
                tradingAccount: 'unified',
                leaveBehind: 1
            },
            apiKey: credentials.key,
            enableRateLimit: true
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        await ex.loadMarkets();
        return ex;
    },
    "gate": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "gate", apiCredentialsKeyPrefix });
        let ex = new GateExchange({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: {
                fetchOrderBookLimit: 5,
                defaultMarginMode: 'isolated',
                fundingAccount: 'funding',
                tradingAccount: 'swap',
                leaveBehind: 1
            }
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        await ex.loadMarkets();
        return ex;
    },
    "coinex": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "coinex", apiCredentialsKeyPrefix });
        let ex = new CoinexExchange({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: {
                fetchOrderBookLimit: 5,
                defaultMarginMode: 'isolated',
                defaultType: 'swap',
                fundingAccount: 'spot',
                tradingAccount: 'swap',
                leaveBehind: 1
            }
        });
        await ex.loadMarkets();
        return ex;
    }
}

export async function sandBoxFundingRateLink(fundingRates: FundingRates, nextFundingHour: number): Promise<FundingRates> {
    let coins = Object.keys(fundingRates);
    for (let i = 0; i < coins.length; i++) {
        let coin = coins[i];
        if ('coinex' in fundingRates[coin]) delete fundingRates[coin]['coinex'];
    }
    return fundingRates;
}

export async function getCoinGlassData({
    ssm,
    coinglassSecretKey
}: {
    ssm: AWS.SSM,
    coinglassSecretKey: string
}): Promise<FundingRatesChainFunction> {
    let secret = await getCoinglassSecret({ ssm, coinglassSecretKey });

    return async function (fundingRates: FundingRates, nextFundingHour: number): Promise<FundingRates> {
        if ([0, 8, 16].indexOf(nextFundingHour) == -1) return fundingRates;

        let response = await fetch('https://open-api.coinglass.com/public/v2/funding', {
            method: "GET",
            headers: {
                "accept": "application/json",
                "coinglassSecret": secret
            }
        });

        let { data } = await response.json();

        for (let i = 0; i < data.length; i++) {
            let entry = data[i];
            let symbol = entry.symbol;

            fundingRates[symbol] = {};
            let marginList = entry.uMarginList;
            for (let ii = 0; ii < marginList.length; ii++) {
                let marginData = marginList[ii];
                let exchange = marginData.exchangeName.toLowerCase();
                let rate = marginData.rate;
                if (!rate) continue;
                fundingRates[symbol][exchange] = { ...fundingRates[symbol][exchange] };
                fundingRates[symbol][exchange][`${symbol}/USDT:USDT`] = rate;
            }
        }
        return fundingRates;
    }
}

export function calculateRoi({
    calculation1,
    calculation2,
    investment
}: {
    calculation1: FundingRateCalculation,
    calculation2: FundingRateCalculation,
    investment: number
}): RoiTradePair {
    let { longCalc, shortCalc } =
        (calculation1.rate < calculation2.rate) ?
            { longCalc: calculation1, shortCalc: calculation2 } :
            { longCalc: calculation2, shortCalc: calculation1 };

    let { longFee, shortFee, makerSide } =
        ((longCalc.makerFee + shortCalc.takerFee) < (longCalc.takerFee + shortCalc.makerFee)) ?
            {
                longFee: longCalc.makerFee,
                shortFee: shortCalc.takerFee,
                makerSide: <MakerSide>'long'
            } : {
                longFee: longCalc.takerFee,
                shortFee: shortCalc.makerFee,
                makerSide: <MakerSide>'short'
            };

    let leverage = Math.min(shortCalc.calculatedLeverage, longCalc.calculatedLeverage);

    let leveragedAmount = (investment * leverage) / 2;
    let longIncome = (leveragedAmount * longCalc.rate);
    let shortIncome = (leveragedAmount * shortCalc.rate);
    let roi = Math.abs(longIncome - shortIncome)
        - (leveragedAmount * longFee * 2)
        - (leveragedAmount * shortFee * 2);

    return {
        roi,
        makerSide,
        leverage,
        longMaxLeverage: longCalc.maxLeverage,
        shortMaxLeverage: shortCalc.maxLeverage,
        longExchange: longCalc.exchange,
        longSymbol: longCalc.symbol,
        shortExchange: shortCalc.exchange,
        shortSymbol: shortCalc.symbol,
        longRiskIndex: longCalc.riskIndex,
        shortRiskIndex: shortCalc.riskIndex
    };
}


export function calculateMaxLeverage({
    investment,
    leverageTiers,
    contractSize = 1,
    currentPrice
}: {
    investment: number,
    leverageTiers: LeverageTier[],
    contractSize?: number,
    currentPrice?: number
}): {
    calculatedLeverage: number,
    tier: LeverageTier
} {

    for (let i = leverageTiers.length - 1; i >= 0; i--) {
        let tier = leverageTiers[i];
        let leveragedInvestment = tier.maxLeverage * investment;
        let maxTradableNotion = (currentPrice) ?
            currentPrice * contractSize * tier.maxNotional :
            tier.maxNotional;
        if (leveragedInvestment < maxTradableNotion) continue;
        let calculatedLeverage = maxTradableNotion / investment;
        return {
            calculatedLeverage,
            tier
        }
    }
    let tier = leverageTiers[0];
    return {
        calculatedLeverage: tier.maxLeverage,
        tier
    }
}

export function processFundingRatesPipeline(processinglinks: FundingRatesChainFunction[]) {
    return async function ({
        nextFundingHour
    }: {
        nextFundingHour: number
    }): Promise<FundingRates> {
        let fundingRates: FundingRates = {};
        for (let i = 0; i < processinglinks.length; i++) {
            let link = processinglinks[i];
            fundingRates = await link(fundingRates, nextFundingHour);
        }
        return fundingRates;
    };
}

export async function calculateBestRoiTradingPairs({
    exchangeCache,
    investment,
    referenceData,
    fundingRates,
    minThreshold = 0,
}: {
    fundingRates: FundingRates,
    minThreshold?: number,
    exchangeCache: { [exchange: string]: ExchangePro },
    investment: number,
    referenceData: TradePairReferenceData
}): Promise<RoiTradePair[]> {
    let bestTradingPairs: RoiTradePair[] = [];

    let investmentInLeg = investment / 2;

    let coins = Object.keys(fundingRates);
    for (let coinIndex = 0; coinIndex < coins.length; coinIndex++) {
        let coin = coins[coinIndex];
        if (!(coin in referenceData)) continue;

        let coinCalculations: FundingRateCalculation[] = [];
        let exchanges = Object.keys(fundingRates[coin]);

        for (let exchangeIndex = 0; exchangeIndex < exchanges.length; exchangeIndex++) {
            let exchangeName = exchanges[exchangeIndex];
            if (!(exchangeName in exchangeCache) || !(exchangeName in referenceData[coin])) continue;

            let exchange = exchangeCache[exchangeName];
            let pairs = Object.keys(fundingRates[coin][exchangeName]);

            for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
                let symbol = pairs[pairIndex];
                if (!(symbol in referenceData[coin][exchangeName])) continue;
                if (!(symbol in exchange.markets)) continue;

                let reference = referenceData[coin][exchangeName][symbol];
                let rate: number = fundingRates[coin][exchangeName][symbol] / 100;
                let leverageTiers = reference.riskLevels?.levels || [];
                let contractSize = reference.riskLevels?.contractSize;
                let currentPrice = undefined;
                if (reference.riskLevels?.type == 'base') {
                    currentPrice = (await exchange.fetchOHLCV(symbol, undefined, undefined, 1))[0][4];
                }
                let calculation = calculateMaxLeverage({ investment: investmentInLeg, leverageTiers, contractSize, currentPrice });
                let maxLeverage = Math.floor(calculation.tier.maxLeverage * 1000) / 1000;
                let calculatedLeverage = calculation.calculatedLeverage;
                let riskIndex = calculation.tier.tier;

                let coinCalculation: FundingRateCalculation = {
                    exchange: exchangeName,
                    symbol,
                    maxLeverage,
                    makerFee: reference.makerFee,
                    takerFee: reference.takerFee,
                    calculatedLeverage,
                    rate,
                    riskIndex
                };

                coinCalculations.push(coinCalculation);
            }
        }

        let coinTradePairs: RoiTradePair[] = [];

        for (let outer = 0; outer < coinCalculations.length - 1; outer++) {
            for (let inner = (outer + 1); inner < coinCalculations.length; inner++) {
                let roi = calculateRoi({ investment, calculation1: coinCalculations[outer], calculation2: coinCalculations[inner] });
                if (roi.roi <= minThreshold) continue;
                coinTradePairs.push(roi);
            }
        }
        let sortedCoinPairs = coinTradePairs.sort((a, b) => b.roi - a.roi);
        let filteredPairs: RoiTradePair[] = [];
        let filteredExchanges: string[] = [];

        for (let i = 0; i < sortedCoinPairs.length; i++) {
            let roiTradePair = sortedCoinPairs[i];
            let longExchange = roiTradePair.longExchange;
            let shortExchange = roiTradePair.shortExchange;
            if (filteredExchanges.indexOf(longExchange) > -1 || filteredExchanges.indexOf(shortExchange) > -1) continue;
            filteredExchanges.push(longExchange);
            filteredExchanges.push(shortExchange);
            filteredPairs.push(roiTradePair);
        }
        bestTradingPairs = [...bestTradingPairs, ...filteredPairs];
    }
    let sortedPairs = bestTradingPairs.sort((a, b) => b.roi - a.roi);

    return sortedPairs;
};

export async function sizeOfCloseOrdersPlaced({
    exchange,
    symbol,
    triggerType
}: {
    exchange: ccxt.ExchangePro,
    symbol: string,
    triggerType: 'sl' | 'tp'
}): Promise<number> {
    let position = await exchange.fetchPosition(symbol) || {};

    if (triggerType == 'sl' && position?.info?.stop_loss_price > 0) {
        return await getPositionSize({ exchange, symbol });
    }

    if (triggerType == 'tp' && position?.info?.take_profit_price > 0) {
        return await getPositionSize({ exchange, symbol });
    }

    let orders = await (<FetchOpenStopOrdersFunction>exchange.fetchOpenStopOrders)(symbol);
    if (!orders?.length || !position) return 0;

    let contractSize = exchange.market(symbol).contractSize || 1;
    let entryPrice = parseFloat(position.entryPrice);
    let side = position.side;
    let triggerOrders: Order[] = [];


    if (triggerType == 'sl' && side == "long") {
        triggerOrders = orders.filter((o: any) =>
            !!o.triggerPrice && o.triggerPrice < entryPrice);
    }

    if (triggerType == 'sl' && side == "short") {
        triggerOrders = orders.filter((o: any) =>
            !!o.triggerPrice && o.triggerPrice > entryPrice);
    }

    if (triggerType == 'tp' && side == "long") {
        triggerOrders = orders.filter((o: any) =>
            !!o.triggerPrice && parseFloat(o.triggerPrice) > entryPrice);
    }

    if (triggerType == 'tp' && side == "short") {
        triggerOrders = orders.filter((o: any) =>
            !!o.triggerPrice && parseFloat(o.triggerPrice) < entryPrice);
    }

    if (triggerOrders.length == 0) return 0;

    let totalContracts = triggerOrders.reduce((a, o) => a + ((o.remaining != undefined) ? o.remaining : o.amount), 0);
    return totalContracts * contractSize;
}

export async function sizeOfTakeProfitOrders(params: {
    exchange: ccxt.ExchangePro,
    symbol: string
}): Promise<number> {
    return sizeOfCloseOrdersPlaced({ ...params, triggerType: 'tp' });
}

export async function sizeOfStopLossOrders(params: {
    exchange: ccxt.ExchangePro,
    symbol: string
}): Promise<number> {
    return sizeOfCloseOrdersPlaced({ ...params, triggerType: 'sl' });
}

export async function createOrder({
    exchange,
    symbol,
    side,
    size,
    price = undefined,
    getPrice = undefined,
    reduceOnly = false,
    stopLossPrice = undefined,
    takeProfitPrice = undefined,
    positionId = undefined,
    immediate = false
}: CreateOrderDetails): Promise<ccxt.Order> {
    let type = 'limit';
    let params: any = { type: 'limit', postOnly: true };

    if (immediate || stopLossPrice) {
        delete params.postOnly;
        params["timeInForce"] = "IOC";
    }

    if (reduceOnly) params['reduceOnly'] = true;
    if (stopLossPrice || takeProfitPrice) params['reduceOnly'] = true;
    if (stopLossPrice) params['stopLossPrice'] = stopLossPrice;
    if (takeProfitPrice) params['takeProfitPrice'] = takeProfitPrice;
    if (positionId) params['positionId'] = positionId;
    if (getPrice == undefined) getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? b : a;
    if (price) getPrice = undefined;
    if (immediate) {
        type = 'market';
        params.type = 'market';
        price = undefined;
        getPrice = undefined;
    }

    let order: ccxt.Order | null = null;

    if (getPrice) {
        let ob = await exchange.fetchOrderBook(symbol, exchange.options.fetchOrderBookLimit);
        let bestBid = ob.bids[0][0];
        let bestAsk = ob.asks[0][0];
        price = getPrice({ side: side, bid: bestBid, ask: bestAsk });
    }
    console.log(`create ${type} order: ${exchange.id} ${symbol} ${side} ${size} $${price ? price : 'n/a'}`);
    order = await exchange.createOrder(symbol, type, side, size, price, params);
    return order;
}

export async function createImmediateOrder(params: CreateOrderDetails): Promise<ccxt.Order> {
    return await createOrder({ ...params, immediate: true });
}

export async function calculateLiquidationPrice({
    exchange,
    market,
    position
}: {
    exchange: ccxt.pro.Exchange,
    market: ccxt.Market,
    position: any
}): Promise<number> {

    let liqPrice = position.liquidationPrice;
    if (liqPrice >= 0) return +liqPrice;

    let size = (position.contracts || 0) * (market.contractSize || 1);
    let balances: ccxt.Balances = await exchange.fetchBalance({ type: market.type || 'swap' });
    let available =
        (('BUSD' in balances) ? balances['BUSD'].free : 0) +
        (('USDT' in balances) ? balances['USDT'].free : 0) +
        (('USDC' in balances) ? balances['USDC'].free : 0);

    liqPrice = (position.side == "long") ?
        position.markPrice - (available + position.initialMargin - position.maintenanceMargin) / size :
        position.markPrice + (available + position.initialMargin - position.maintenanceMargin) / size;

    if (liqPrice < 0) return 0;

    return liqPrice;
}

export async function createSlOrders({
    longExchange,
    longSymbol,
    shortExchange,
    shortSymbol,
    limit,
    trigger
}: {
    longExchange: ccxt.pro.Exchange,
    shortExchange: ccxt.pro.Exchange,
    longSymbol: string,
    shortSymbol: string,
    limit: number,
    trigger: number
}) {
    let { contractSize: longContractSize, maxSize: longMaxSize, minSize: longMinSize } = getLimits({ exchange: longExchange, symbol: longSymbol });
    let { contractSize: shortContractSize, maxSize: shortMaxSize, minSize: shortMinSize } = getLimits({ exchange: shortExchange, symbol: shortSymbol });

    let longPosition = await longExchange.fetchPosition(longSymbol) || {};
    let shortPosition = await shortExchange.fetchPosition(shortSymbol) || {};

    let longPositionSize = Math.abs((longPosition.contracts || 0) * longContractSize);
    let shortPositionSize = Math.abs((shortPosition.contracts || 0) * shortContractSize);

    let liquidationPrice = await calculateLiquidationPrice({ exchange: longExchange, position: longPosition, market: longExchange.market(longSymbol) });
    let price = liquidationPrice * (1 + limit);
    let stopLossPrice = liquidationPrice * (1 + limit + trigger);

    if (liquidationPrice > 0) {
        await adjustUntilTargetMet({
            target: longPositionSize, contractSize: longContractSize, idealSize: longMaxSize, maxSize: longMaxSize, minSize: longMinSize, direction: 'up',
            getPositionSize: () => sizeOfStopLossOrders({ exchange: longExchange, symbol: longSymbol }),
            createOrder: (size) => createOrder({ exchange: longExchange, side: "sell", size, symbol: longSymbol, price, stopLossPrice, positionId: longPosition.id })
        });
    }

    liquidationPrice = await calculateLiquidationPrice({ exchange: shortExchange, position: shortPosition, market: shortExchange.market(shortSymbol) });
    price = liquidationPrice * (1 - limit);
    stopLossPrice = liquidationPrice * (1 - limit - trigger);

    if (liquidationPrice > 0) {
        await adjustUntilTargetMet({
            target: shortPositionSize, contractSize: shortContractSize, idealSize: shortMaxSize, maxSize: shortMaxSize, minSize: shortMinSize, direction: 'up',
            getPositionSize: () => sizeOfStopLossOrders({ exchange: shortExchange, symbol: shortSymbol }),
            createOrder: (size) => createOrder({ exchange: shortExchange, side: "buy", size, symbol: shortSymbol, price, stopLossPrice, positionId: shortPosition.id })
        });
    }
}

export async function createTpOrders({
    longExchange,
    longSymbol,
    shortExchange,
    shortSymbol,
    limit,
    trigger
}: {
    longExchange: ccxt.pro.Exchange,
    shortExchange: ccxt.pro.Exchange,
    longSymbol: string,
    shortSymbol: string,
    limit: number,
    trigger: number
}) {

    let { contractSize: longContractSize, maxSize: longMaxSize, minSize: longMinSize } = getLimits({ exchange: longExchange, symbol: longSymbol });
    let { contractSize: shortContractSize, maxSize: shortMaxSize, minSize: shortMinSize } = getLimits({ exchange: shortExchange, symbol: shortSymbol });

    let longPosition = await longExchange.fetchPosition(longSymbol) || {};
    let shortPosition = await shortExchange.fetchPosition(shortSymbol) || {};

    let longPositionSize = Math.abs((longPosition.contracts || 0) * longContractSize);
    let shortPositionSize = Math.abs((shortPosition.contracts || 0) * shortContractSize);

    let liquidationPriceShort = await calculateLiquidationPrice({ exchange: shortExchange, position: shortPosition, market: shortExchange.market(shortSymbol) });
    let entryDiff = longPosition.entryPrice - shortPosition.entryPrice;

    let maxLong = +liquidationPriceShort + entryDiff;
    let price = maxLong * (1 - limit);
    let takeProfitPrice = maxLong * (1 - limit - trigger);

    if (price > 0) {
        await adjustUntilTargetMet({
            target: longPositionSize, contractSize: longContractSize, idealSize: longMaxSize, maxSize: longMaxSize, minSize: longMinSize, direction: 'up',
            getPositionSize: () => sizeOfTakeProfitOrders({ exchange: longExchange, symbol: longSymbol }),
            createOrder: (size) => createOrder({ exchange: longExchange, side: "sell", size, symbol: longSymbol, price, takeProfitPrice, positionId: longPosition.id })
        });
    }

    let liquidationPriceLong = await calculateLiquidationPrice({ exchange: longExchange, position: longPosition, market: longExchange.market(longSymbol) });

    let minShort = liquidationPriceLong - entryDiff;
    price = minShort * (1 + limit);
    takeProfitPrice = minShort * (1 + limit + trigger);

    if (price > 0) {
        await adjustUntilTargetMet({
            target: shortPositionSize, contractSize: shortContractSize, idealSize: shortMaxSize, maxSize: shortMaxSize, minSize: shortMinSize, direction: 'up',
            getPositionSize: () => sizeOfTakeProfitOrders({ exchange: shortExchange, symbol: shortSymbol }),
            createOrder: (size) => createOrder({ exchange: shortExchange, side: "buy", size, symbol: shortSymbol, price, takeProfitPrice, positionId: shortPosition.id })
        });
    }
}

export async function getPositionSize({ exchange, symbol }: { exchange: ccxt.ExchangePro, symbol: string }): Promise<number> {
    let market = exchange.market(symbol);
    let position = await exchange.fetchPosition(symbol);
    return (position?.contracts || 0) * (market.contractSize || 1);
}

export async function closePositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "buy", longSide: "sell", reduceOnly: true, targetSize: 0 });
}

export async function openPositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "sell", longSide: "buy", reduceOnly: false });
}

function calculateOrderSize({
    idealSize,
    contractSize,
    maxSize,
    orderSize
}: {
    idealSize: number,
    contractSize: number,
    maxSize: number,
    orderSize: number
}): number {
    orderSize = orderSize || 1;
    maxSize = maxSize || 1;
    idealSize = idealSize || 1;
    contractSize = contractSize || 1;

    orderSize = (orderSize > maxSize) ? maxSize : orderSize;
    orderSize = (orderSize > idealSize) ? idealSize : orderSize;
    orderSize = orderSize / contractSize;
    return orderSize
}

function getLimits({
    exchange,
    symbol
}: {
    exchange: ccxt.pro.Exchange,
    symbol: string
}): {
    contractSize: number,
    maxSize: number,
    minSize: number
} {
    let market = exchange.market(symbol);
    let contractSize = +(market.contractSize || 1);
    let maxSize = +(market.limits.amount?.max || 0);
    let minSize = +(market.limits.amount?.min || 0);

    if (!minSize) minSize = contractSize
    if (!maxSize) maxSize = minSize;

    return {
        contractSize,
        maxSize,
        minSize
    }
}

export async function adjustUntilTargetMet({
    target,
    getPositionSize,
    createOrder,
    idealSize,
    contractSize,
    maxSize,
    minSize,
    direction,
    sleepTimeout = 250,
    retryLimit = 10
}: {
    target: number,
    getPositionSize: () => Promise<number>,
    createOrder: (orderSize: number) => Promise<any>,
    idealSize: number,
    contractSize: number,
    maxSize: number,
    minSize: number,
    direction?: 'up' | 'down',
    sleepTimeout?: number,
    retryLimit?: number
}) {
    target = Math.abs(target);
    let previousSize = 0;
    while (true) {
        let currentSize = Math.abs(await getPositionSize());
        if (currentSize != 0 && target != 0 && previousSize != 0)
            console.log(`adjust til met: current:${currentSize} target:${target} previous:${previousSize}`)
        let retryCount = 0;
        while (previousSize == currentSize && currentSize != 0) {
            retryCount++;
            if (retryCount > retryLimit) throw "The postion has not changed size after creating order";
            asyncSleep(sleepTimeout);
            currentSize = Math.abs(await getPositionSize());
        }
        previousSize = currentSize;

        if (direction == undefined) direction = (currentSize < target) ? 'up' : 'down';
        let orderSize = Math.abs(currentSize - target);
        if ((orderSize < minSize) ||
            (direction == 'up' && currentSize > target) ||
            (direction == 'down' && currentSize < target)) return;

        console.log(`adjust til met:calculating idealSize:${idealSize} contractSize:${contractSize} maxSize:${maxSize} orderSize:${orderSize}`);
        orderSize = calculateOrderSize({ idealSize, contractSize, maxSize, orderSize });
        console.log(`adjust til met:placing order with size:${orderSize}`)

        await createOrder(orderSize);
    }
}

export async function adjustPositions({
    longExchange,
    longSymbol,
    shortExchange,
    shortSymbol,
    makerSide,
    reduceOnly,
    idealOrderValue,
    idealBatchSize = 1,
    targetSize = 0,
    shortSide = "sell",
    longSide = "buy"
}: AdjustPositionDetails) {
    let {
        makerOrderSide,
        makerExchange,
        makerSymbol,
        takerOrderSide,
        takerExchange,
        takerSymbol
    } = (makerSide == 'long') ?
            {
                makerOrderSide: longSide,
                makerExchange: longExchange,
                makerSymbol: longSymbol,
                takerOrderSide: shortSide,
                takerExchange: shortExchange,
                takerSymbol: shortSymbol
            } : {
                makerOrderSide: shortSide,
                makerExchange: shortExchange,
                makerSymbol: shortSymbol,
                takerOrderSide: longSide,
                takerExchange: longExchange,
                takerSymbol: longSymbol
            };
    if (!(makerSymbol in makerExchange.markets) || !(takerSymbol in takerExchange.markets)) return;

    let {
        contractSize: makerContractSize,
        maxSize: makerMaxSize,
        minSize: makerMinSize
    } = getLimits({
        exchange: makerExchange,
        symbol: makerSymbol
    });

    let {
        contractSize: takerContractSize,
        maxSize: takerMaxSize,
        minSize: takerMinSize
    } = getLimits({
        exchange: takerExchange,
        symbol: takerSymbol
    });

    let balanceHedge = async () => {
        while (true) {
            let makerPositionSize = Math.abs(await getPositionSize({ exchange: makerExchange, symbol: makerSymbol }));
            if (makerPositionSize != 0)
                console.log(`adjust:balanceHedge: makerSize:${makerPositionSize}`)

            await adjustUntilTargetMet({
                target: makerPositionSize,
                idealSize: takerMaxSize,
                contractSize: takerContractSize,
                maxSize: takerMaxSize,
                minSize: takerMinSize,
                direction: (targetSize == 0) ? 'down' : 'up',
                getPositionSize: () => getPositionSize({ exchange: takerExchange, symbol: takerSymbol }),
                createOrder: (size) => createImmediateOrder({ exchange: takerExchange, side: takerOrderSide, size, symbol: takerSymbol, reduceOnly })
            })
            if ((Math.abs(makerPositionSize - targetSize) < makerMinSize) || (targetSize && makerPositionSize > targetSize)) break;
        }
    }

    let placeOrders = async () => {

        while (true) {

            let ob = await makerExchange.fetchOrderBook(makerSymbol, makerExchange.options.fetchOrderBookLimit);
            let bestPrice = (makerOrderSide == 'buy') ? ob.bids[0][0] : ob.asks[0][0];
            let makerIdealSize = idealOrderValue / (bestPrice || 1);

            let orders = await makerExchange.fetchOpenOrders(makerSymbol);
            orders = orders.filter((o: any) => o.side == makerOrderSide && !o.triggerPrice);

            for (let i = 0; i < orders.length; i++) {
                let order = orders[i];

                if (!order?.id || !order?.price) continue;
                if ((order.price <= bestPrice && makerOrderSide == 'sell') ||
                    (order.price >= bestPrice && makerOrderSide == 'buy')) continue;

                console.log(`adjust:placeOrders canceling order for trailing ${order?.id}`);
                await makerExchange.cancelOrder(order.id, makerSymbol);
            }

            orders = (await makerExchange.fetchOpenOrders(makerSymbol)).filter((o: any) => o.side == makerOrderSide && !o.triggerPrice);
            let ordersInProgress = orders.length;
            let totalInOrders = orders.reduce((p, order) => p + Math.abs((order.remaining != undefined) ? order.remaining : order.amount), 0) * makerContractSize;
            let makerPositionSize = Math.abs(await getPositionSize({ exchange: makerExchange, symbol: makerSymbol }));
            if ((Math.abs(makerPositionSize - targetSize) < makerMinSize) || (targetSize && makerPositionSize > targetSize)) break;

            let size = (targetSize == 0) ?
                (makerPositionSize - totalInOrders) :
                targetSize - (totalInOrders + makerPositionSize);

            console.log(`adjust:placeOrders size remaining: ${size}`);

            if (size < 0) {
                console.log(`adjust:placeOrders too many orders need to cancel size: ${size}`);
                orders = (await makerExchange.fetchOpenOrders(makerSymbol)).filter((o: any) => o.side == makerOrderSide && !o.triggerPrice);
                for (let i = 0; i < orders.length; i++) {
                    let order = orders[i];
                    if (!order?.id || !order?.price) continue;
                    await makerExchange.cancelOrder(order.id, makerSymbol);
                }
                continue;
            }

            if (size < makerMinSize) continue;
            if (ordersInProgress >= idealBatchSize) continue;

            size = calculateOrderSize({
                contractSize: makerContractSize,
                idealSize: makerIdealSize,
                maxSize: makerMaxSize,
                orderSize: size
            });

            console.log(`adjust:placeOrders placing maker order with calculated size: ${size}`);
            await createOrder({ exchange: makerExchange, side: makerOrderSide, size, symbol: makerSymbol, reduceOnly });
        }
    }

    await Promise.all([balanceHedge(), placeOrders()]);

    let orders = await makerExchange.fetchOpenOrders(makerSymbol);
    orders = orders.filter((o: any) => o.side == makerOrderSide && !o.triggerPrice);
    if (orders.length > 0) console.log(`Too many orders cancelling ${orders.length} orders`);

    for (let i = 0; i < orders.length; i++) {
        let order = orders[i];
        await makerExchange.cancelOrder(order.id, makerSymbol);
    }

    await correctPosition({
        exchange: makerExchange,
        symbol: makerSymbol,
        contractSize: makerContractSize,
        maxSize: makerMaxSize,
        minSize: makerMinSize,
        targetSize,
        decreaseOrderSide: (makerSide == 'long') ? 'sell' : 'buy',
        increaseOrderSide: (makerSide == 'long') ? 'buy' : 'sell'
    });

    await correctPosition({
        exchange: takerExchange,
        symbol: takerSymbol,
        contractSize: takerContractSize,
        maxSize: takerMaxSize,
        minSize: takerMinSize,
        targetSize,
        decreaseOrderSide: (makerSide == 'short') ? 'sell' : 'buy',
        increaseOrderSide: (makerSide == 'short') ? 'buy' : 'sell'
    });
}

async function correctPosition({
    exchange,
    symbol,
    targetSize,
    contractSize,
    increaseOrderSide,
    decreaseOrderSide,
    maxSize,
    minSize
}: {
    exchange: ccxt.pro.Exchange,
    symbol: string,
    targetSize: number,
    contractSize: number,
    minSize: number
    maxSize: number,
    increaseOrderSide: Order['side'],
    decreaseOrderSide: Order['side']
}) {
    let positionSize = Math.abs(await getPositionSize({ exchange, symbol }));
    let diff = Math.abs(targetSize - positionSize);
    if (diff < minSize) return;

    let size = calculateOrderSize({
        contractSize: contractSize,
        idealSize: maxSize,
        maxSize: maxSize,
        orderSize: diff
    });
    let side = positionSize > targetSize ? decreaseOrderSide : increaseOrderSide;
    console.log(`correctPosition:correcting position for ${symbol} in ${exchange.id} from ${positionSize} to ${targetSize} by doing a ${side}`);
    await createImmediateOrder({ exchange, side, size, symbol });
}

export async function findWithdrawal({
    exchange,
    currency,
    address,
    timestamp,
    depositId,
    limit = 10
}: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    address: string,
    timestamp?: number,
    depositId?: string,
    limit?: number
}): Promise<Transaction | undefined> {
    let transactions = await exchange.fetchWithdrawals(currency, undefined, limit);
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i];
        if (depositId && transaction.id == depositId) return transaction;
        if (timestamp && transaction.timestamp >= timestamp && transaction.address == address) return transaction;
    }

    return undefined;
}

export async function findWithdrawalByTime(params: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    address: string,
    timestamp: number
}): Promise<Transaction | undefined> {
    return await findWithdrawal(params);
}

export async function findWithdrawalById(params: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    address: string,
    depositId: string
}): Promise<Transaction | undefined> {
    return await findWithdrawal(params);
}

export async function findDepositByTxId({
    exchange,
    currency,
    depositTxId,
    limit = 10
}: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    depositTxId?: string,
    limit?: number
}): Promise<Transaction | undefined> {
    let transactions = await exchange.fetchDeposits(currency, undefined, limit);
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i];
        if (transaction.txid == depositTxId) return transaction;
    }

    return undefined
}

export async function withdrawFunds({
    address,
    currency,
    timestamp,
    network,
    depositAmount,
    depositId,
    depositTxId,
    withdrawalExchange,
    depositExchange,
    saveState,
    retryLimit = 360
}: {
    address: string,
    currency: string,
    timestamp: number,
    network: string,
    depositAmount?: number,
    depositId?: string,
    depositTxId?: string,
    withdrawalExchange: ccxt.pro.Exchange,
    depositExchange: ccxt.pro.Exchange,
    saveState: ({ depositId, depositTxId }: { depositId?: string, depositTxId?: string }) => Promise<void>,
    retryLimit?: number
}) {
    if (withdrawalExchange.id == depositExchange.id) return;

    if (!depositId) {
        let transaction = await findWithdrawalByTime({
            address,
            currency,
            exchange: withdrawalExchange,
            timestamp
        });
        if (transaction) {
            ({
                id: depositId,
                txid: depositTxId
            } = transaction);
        }
    }

    if (!depositTxId && !depositId) {
        let fundingBalace = await withdrawalExchange.fetchBalance({ type: withdrawalExchange.options.fundingAccount });
        let availableInFunding = fundingBalace[currency]?.free || 0;
        let leaveBehind = (withdrawalExchange.options.leaveBehind || 1);

        let tradingBalance = await withdrawalExchange.fetchBalance({ type: withdrawalExchange.options.tradingAccount });
        let availableInTrading = tradingBalance[currency]?.free || 0;
        availableInTrading = (Math.floor(availableInTrading * 100) / 100) - leaveBehind;

        if (!depositAmount && availableInTrading > 0) {
            await withdrawalExchange.transfer(currency, availableInTrading, withdrawalExchange.options.tradingAccount, withdrawalExchange.options.fundingAccount);
        }

        if (depositAmount && availableInFunding < depositAmount) {
            let transferAmount = Math.floor((depositAmount - availableInFunding) * 100) / 100;
            if (availableInTrading < transferAmount) throw `Not enough funds available ${currency} ${depositAmount} in ${withdrawalExchange.id}`;
            await withdrawalExchange.transfer(currency, transferAmount, withdrawalExchange.options.tradingAccount, withdrawalExchange.options.fundingAccount);
        }

        if (!depositAmount) depositAmount = (availableInFunding + availableInTrading) - leaveBehind;
        if (depositAmount <= 0) throw `Not enough funds available in ${withdrawalExchange.id}`;

        let params: any = { network };
        if (withdrawalExchange.options.withdrawalFee) {
            params['fee'] = withdrawalExchange.options.withdrawalFee
        }

        depositAmount = Math.floor(depositAmount * 100) / 100;

        let transactionResult = await withdrawalExchange.withdraw(currency, depositAmount, address, undefined, params);
        depositId = transactionResult.id;
        await saveState({ depositId, depositTxId });
    }

    let retryCount = 0;
    while (!depositTxId && depositId) {
        let transaction = await findWithdrawalById({
            address,
            currency,
            exchange: withdrawalExchange,
            depositId
        });
        if (transaction) {
            ({
                id: depositId,
                txid: depositTxId
            } = transaction);
        }
        if (depositTxId) {
            await saveState({ depositId, depositTxId });
            break;
        }
        if (!transaction)
            retryCount++;
        if (retryCount > retryLimit)
            throw `${currency} withdrawal on ${withdrawalExchange.id} to address ${address} with id ${depositId} could not be found`;
        await asyncSleep(10000);
    }

    retryCount = 0;
    while (true) {
        let transaction = await findDepositByTxId({ exchange: depositExchange, currency, depositTxId });
        if (transaction?.status == 'ok')
            break;
        if (!transaction)
            retryCount++;
        if (retryCount > retryLimit)
            throw `${currency} deposit on ${depositExchange.id} with TxId ${depositTxId} could not be found`;
        await asyncSleep(10000);
    }
}