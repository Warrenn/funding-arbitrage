import { setTimeout as asyncSleep } from 'timers/promises';
import ccxt, { ExchangePro, Order } from 'ccxt';
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
    BinanceExchange,
    BybitExchange,
    CoinexExchange,
    GateExchange,
    OkxExchange,
    FundingRatesChainFunction,
    TradePairReferenceData,
    FetchOpenStopOrdersFunction,
    IdealTradeSizes
} from './types.js';

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
    return ssm.putParameter({ Name: tradeStatusKey, Value: jsonValue }).promise();
}

export async function getTradeState({ ssm, tradeStatusKey }: { ssm: AWS.SSM, tradeStatusKey: string }): Promise<any> {
    let ssmParam = await ssm.getParameter({ Name: `${tradeStatusKey}` }).promise();
    return JSON.parse(`${ssmParam.Parameter?.Value}`);
}

export async function getSettings({ ssm, settingsPrefix }: { ssm: AWS.SSM, settingsPrefix: string }): Promise<any> {
    let ssmParam = await ssm.getParameter({ Name: `${settingsPrefix}` }).promise();
    return JSON.parse(`${ssmParam.Parameter?.Value}`);
}

export const factory: { [key: string]: ExchangeFactory } = {
    "binance": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "binance", apiCredentialsKeyPrefix });
        let ex = new BinanceExchange({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
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
                fetchOrderBookLimit: 5
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
                fetchOrderBookLimit: 5
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
            options: { fetchOrderBookLimit: 5 }
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
            options: { fetchOrderBookLimit: 5 }
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

                let reference = referenceData[coin][exchangeName][symbol];
                let rate: number = fundingRates[coin][exchangeName][symbol] / 100;
                let leverageTiers = reference.riskLevels?.levels || [];
                let contractSize = reference.riskLevels?.contractSize;
                let currentPrice = undefined;
                if (reference.riskLevels?.type == 'base') {
                    currentPrice = (await exchange.fetchOHLCV(symbol, '1s', undefined, 1))[0][4];
                }
                let calculation = calculateMaxLeverage({ investment: investmentInLeg, leverageTiers, contractSize, currentPrice });
                let maxLeverage = calculation.tier.maxLeverage;
                let calculatedLeverage = calculation.calculatedLeverage;
                let riskIndex = `${calculation.tier.tier}`;

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
    position,
    symbol,
    triggerType
}: {
    exchange: ccxt.ExchangePro,
    position: any,
    symbol: string,
    triggerType: 'sl' | 'tp'
}): Promise<number> {
    let orders = await (<FetchOpenStopOrdersFunction>exchange.fetchOpenStopOrders)(symbol);
    if (!orders?.length) return 0;

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
    position: any,
    symbol: string
}): Promise<number> {
    return sizeOfCloseOrdersPlaced({ ...params, triggerType: 'tp' });
}

export async function sizeOfStopLossOrders(params: {
    exchange: ccxt.ExchangePro,
    position: any,
    symbol: string
}): Promise<number> {
    return sizeOfCloseOrdersPlaced({ ...params, triggerType: 'sl' });
}

export async function createLimitOrder({
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
    retryLimit = 10,
    immediate = false
}: CreateOrderDetails): Promise<ccxt.Order> {

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
    if (price) getPrice = ({ }) => price;
    if (immediate && getPrice == undefined) getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? a : b;
    if (getPrice == undefined) getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? b : a;

    let retryCount = 0;
    while (true) {
        let order: ccxt.Order | null = null;

        try {
            let ob = await exchange.fetchOrderBook(symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];
            let price = getPrice({ side: side, bid: bestBid, ask: bestAsk });
            order = await exchange.createLimitOrder(symbol, side, size, price, params);
            if (!order) continue;
            if (!order.id && (stopLossPrice || takeProfitPrice)) {
                let position = await exchange.fetchPosition(symbol);
                if (stopLossPrice && position.info.stop_loss_price > 0) return order;
                if (position.info.take_profit_price > 0) return order;
                continue;
            }
            while (true) {
                try {
                    order = await exchange.fetchOrder(order.id, symbol);
                    if (!order) continue;
                    if (order.status == 'open' || order.status == 'closed') return order;
                    break;
                }
                catch (error) {
                    retryCount++;
                    console.log(error);
                    if (retryCount > retryLimit) throw error;
                }
            }
        }
        catch (error) {
            retryCount++;
            console.log(error);
            if (retryCount > retryLimit) throw error;
        }
    }
}

export async function createImmediateOrder(params: CreateOrderDetails): Promise<ccxt.Order> {
    return await createLimitOrder({ ...params, immediate: true });
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
    if (liqPrice >= 0) return liqPrice;

    let size = (position.contracts || 0) * (market.contractSize || 1);
    let balances: ccxt.Balances = await exchange.fetchBalance({ type: market.type || 'swap' });
    let available =
        (('BUSD' in balances) ? balances['BUSD'].free : 0) +
        (('USDT' in balances) ? balances['USDT'].free : 0) +
        (('USDC' in balances) ? balances['USDC'].free : 0);

    liqPrice = (position.side == "long") ?
        position.markPrice - (available + position.initialMargin - position.maintenanceMargin) / size :
        position.markPrice + (available + position.initialMargin - position.maintenanceMargin) / size;

    return liqPrice;
}

export async function createSlOrders({
    longExchange,
    longSymbol,
    shortExchange,
    shortSymbol,
    limit,
    trigger,
    idealTradeSizes
}: {
    longExchange: ccxt.pro.Exchange,
    shortExchange: ccxt.pro.Exchange,
    longSymbol: string,
    shortSymbol: string,
    limit: number,
    trigger: number,
    idealTradeSizes: IdealTradeSizes
}) {
    let { contractSize: longContractSize, idealSize: longIdealSize, maxSize: longMaxSize } = getLimits({ exchange: longExchange, symbol: longSymbol, idealTradeSizes });
    let { contractSize: shortContractSize, idealSize: shortIdealSize, maxSize: shortMaxSize } = getLimits({ exchange: longExchange, symbol: longSymbol, idealTradeSizes });

    let longPosition = await longExchange.fetchPosition(longSymbol);
    let shortPosition = await shortExchange.fetchPosition(shortSymbol);

    let longPositionSize = (longPosition.contracts || 0) * longContractSize;
    let shortPositionSize = (shortPosition.contracts || 0) * shortContractSize;

    let liquidationPrice = await calculateLiquidationPrice({ exchange: longExchange, position: longPosition, market: longExchange.market(longSymbol) });
    let price = liquidationPrice * (1 + limit);
    let stopLossPrice = liquidationPrice * (1 + limit + trigger);

    await adjustUntilTargetMet({
        target: longPositionSize, contractSize: longContractSize, idealSize: longIdealSize, maxSize: longMaxSize,
        getSize: () => sizeOfStopLossOrders({ exchange: longExchange, position: longPosition, symbol: longSymbol }),
        createOrder: (size) => createLimitOrder({ exchange: longExchange, side: "sell", size, symbol: longSymbol, price, stopLossPrice, positionId: longPosition.id })
    });

    liquidationPrice = await calculateLiquidationPrice({ exchange: shortExchange, position: shortPosition, market: shortExchange.market(shortSymbol) });
    price = liquidationPrice * (1 - limit);
    stopLossPrice = liquidationPrice * (1 - limit - trigger);

    await adjustUntilTargetMet({
        target: shortPositionSize, contractSize: shortContractSize, idealSize: shortIdealSize, maxSize: shortMaxSize,
        getSize: () => sizeOfStopLossOrders({ exchange: shortExchange, position: shortPosition, symbol: shortSymbol }),
        createOrder: (size) => createLimitOrder({ exchange: shortExchange, side: "sell", size, symbol: shortSymbol, price, stopLossPrice, positionId: shortPosition.id })
    });
}

export async function createTpOrders({
    longExchange,
    longSymbol,
    shortExchange,
    shortSymbol,
    limit,
    trigger,
    idealTradeSizes
}: {
    longExchange: ccxt.pro.Exchange,
    shortExchange: ccxt.pro.Exchange,
    longSymbol: string,
    shortSymbol: string,
    limit: number,
    trigger: number,
    idealTradeSizes: IdealTradeSizes
}) {

    let { contractSize: longContractSize, idealSize: longIdealSize, maxSize: longMaxSize } = getLimits({ exchange: longExchange, symbol: longSymbol, idealTradeSizes });
    let { contractSize: shortContractSize, idealSize: shortIdealSize, maxSize: shortMaxSize } = getLimits({ exchange: longExchange, symbol: longSymbol, idealTradeSizes });

    let longPosition = await longExchange.fetchPosition(longSymbol);
    let shortPosition = await shortExchange.fetchPosition(shortSymbol);

    let longPositionSize = (longPosition.contracts || 0) * longContractSize;
    let shortPositionSize = (shortPosition.contracts || 0) * shortContractSize;

    let liquidationPriceShort = await calculateLiquidationPrice({ exchange: shortExchange, position: shortPosition, market: shortExchange.market(shortSymbol) });
    let entryDiff = longPosition.entryPrice - shortPosition.entryPrice;

    let maxLong = liquidationPriceShort + entryDiff;
    let price = maxLong * (1 - limit);
    let takeProfitPrice = maxLong * (1 - limit - trigger);

    await adjustUntilTargetMet({
        target: longPositionSize, contractSize: longContractSize, idealSize: longIdealSize, maxSize: longMaxSize,
        getSize: () => sizeOfTakeProfitOrders({ exchange: longExchange, position: longPosition, symbol: longSymbol }),
        createOrder: (size) => createLimitOrder({ exchange: longExchange, side: "sell", size, symbol: longSymbol, price, takeProfitPrice, positionId: longPosition.id })
    });

    let liquidationPriceLong = await calculateLiquidationPrice({ exchange: longExchange, position: longPosition, market: longExchange.market(longSymbol) });

    let minShort = liquidationPriceLong - entryDiff;
    price = minShort * (1 + limit);
    takeProfitPrice = minShort * (1 + limit + trigger);

    await adjustUntilTargetMet({
        target: shortPositionSize, contractSize: shortContractSize, idealSize: shortIdealSize, maxSize: shortMaxSize,
        getSize: () => sizeOfTakeProfitOrders({ exchange: shortExchange, position: shortPosition, symbol: shortSymbol }),
        createOrder: (size) => createLimitOrder({ exchange: shortExchange, side: "sell", size, symbol: shortSymbol, price, takeProfitPrice, positionId: shortPosition.id })
    });
}

export async function getPositionSize({ exchange, symbol }: { exchange: ccxt.ExchangePro, symbol: string }): Promise<number> {
    let market = exchange.market(symbol);
    let position = await exchange.fetchPosition(symbol);
    return (position.contracts || 0) * (market.contractSize || 1);
}

export async function closePositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "buy", longSide: "sell", reduceOnly: true, orderSize: 0 });
}

export async function openPositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "sell", longSide: "buy", reduceOnly: false });
}

function calculateSize({
    idealSize,
    contractSize,
    maxSize,
    size
}: {
    idealSize: number,
    contractSize: number,
    maxSize: number,
    size: number
}): number {
    size = (size > maxSize) ? maxSize : size;
    size = (size > idealSize) ? idealSize : size;
    size = size / contractSize;
    return size
}

function getLimits({
    exchange,
    symbol,
    idealTradeSizes
}: {
    exchange: ccxt.pro.Exchange,
    symbol: string,
    idealTradeSizes: IdealTradeSizes
}): {
    idealSize: number,
    contractSize: number,
    maxSize: number,
    batchSize: number
} {
    let market = exchange.market(symbol);
    let contractSize = market.contractSize || 1;
    let maxSize = market.limits.amount?.max || contractSize;
    let {
        batchSize,
        idealSize
    } = (symbol in idealTradeSizes) ? idealTradeSizes[symbol] : { batchSize: 1, idealSize: maxSize };

    if (idealSize < contractSize) idealSize = contractSize;

    return {
        batchSize,
        contractSize,
        idealSize,
        maxSize
    }
}

export async function adjustUntilTargetMet({
    target,
    getSize,
    createOrder,
    idealSize,
    contractSize,
    maxSize
}: {
    target: number,
    getSize: () => Promise<number>,
    createOrder: (size: number) => Promise<any>,
    idealSize: number,
    contractSize: number,
    maxSize: number,
}) {
    while (true) {
        let newSize = await getSize();
        if (newSize == target) return;

        let size = Math.abs(target - newSize);

        if (size < contractSize) continue;
        size = calculateSize({ idealSize, contractSize, maxSize, size });

        await createOrder(size);
    }
}

export async function adjustPositions({
    longExchange,
    longSymbol,
    shortExchange,
    shortSymbol,
    makerSide,
    idealTradeSizes,
    reduceOnly,
    orderSize = 0,
    shortSide = "sell",
    longSide = "buy",
    trailPct = 0.0001,
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

    let {
        batchSize: makerBatchSize,
        idealSize: makerIdealSize,
        contractSize: makerContractSize,
        maxSize: makerMaxSize
    } = getLimits({
        exchange: makerExchange,
        symbol: makerSymbol,
        idealTradeSizes
    });

    let {
        idealSize: takerIdealSize,
        contractSize: takerContractSize,
        maxSize: takerMaxSize
    } = getLimits({
        exchange: takerExchange,
        symbol: takerSymbol,
        idealTradeSizes
    });

    while (true) {
        let makerPositionSize = await getPositionSize({ exchange: makerExchange, symbol: makerSymbol });
        let takerPositionSize = await getPositionSize({ exchange: takerExchange, symbol: takerSymbol });

        if (makerPositionSize == orderSize && takerPositionSize == orderSize) return;
        await adjustUntilTargetMet({
            target: makerPositionSize,
            idealSize: takerIdealSize,
            contractSize: takerContractSize,
            maxSize: takerMaxSize,
            getSize: () => getPositionSize({ exchange: takerExchange, symbol: takerSymbol }),
            createOrder: (size) => createImmediateOrder({ exchange: takerExchange, side: takerOrderSide, size, symbol: takerSymbol, reduceOnly })
        })
        if (makerPositionSize == orderSize) continue;

        let totalInOrders = 0;
        let currentPrice = (await makerExchange.fetchOHLCV(makerSymbol, '1s', undefined, 1))[0][4];
        let minTrailPrice = currentPrice * (1 - trailPct);
        let maxTrailPrice = currentPrice * (1 + trailPct);

        let orders = await makerExchange.fetchOpenOrders(makerSymbol);
        orders = orders.filter((o: any) => o.side == makerOrderSide && !o.triggerPrice);

        let ordersInProgress = orders.length;
        for (let i = 0; i < orders.length; i++) {
            let order = orders[i];
            if (order.price > minTrailPrice && order.price < maxTrailPrice) {
                totalInOrders += (order.remaining != undefined) ? order.remaining : order.amount;
            }
            else {
                await makerExchange.cancelOrder(order.id, makerSymbol);
                ordersInProgress--;
            }
        }
        totalInOrders = totalInOrders * makerContractSize;

        if (ordersInProgress == makerBatchSize) continue;

        let size = (orderSize == 0) ?
            (makerPositionSize - totalInOrders) :
            orderSize - (totalInOrders + makerPositionSize);

        if (size < makerContractSize) continue;

        size = calculateSize({
            contractSize: makerContractSize,
            idealSize: makerIdealSize,
            maxSize: makerMaxSize,
            size
        });

        await createLimitOrder({ exchange: makerExchange, side: makerOrderSide, size, symbol: makerSymbol, reduceOnly });
    }
}