import {
    TradeState,
    ExchangeFactory,
    binance2,
    okx2,
    bybit2,
    coinex2,
    gate2,
    CoinGlassData,
    AdjustPositionDetails,
    CreateOrderDetails,
    GetFuturesCalculationFunction,
    FuturesCalculation,
    RoiTradePair
} from './types';

import AWS from 'aws-sdk';
import ccxt, { ExchangePro, Order } from 'ccxt';
import { setTimeout as asyncSleep } from 'timers/promises';

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

export let factory: { [key: string]: ExchangeFactory } = {
    "binance": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "binance", apiCredentialsKeyPrefix });
        let ex = new binance2({
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
        let ex = new okx2({
            secret: credentials.secret,
            apiKey: credentials.key,
            password: credentials.password,
            nonce: () => new Date((new Date()).toUTCString()).getTime(),
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        await ex.loadMarkets();
        return ex;
    },
    "bybit": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "bybit", apiCredentialsKeyPrefix });
        let ex = new bybit2({
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
        let ex = new gate2({
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
        let ex = new coinex2({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
        await ex.loadMarkets();
        return ex;
    }
}

export async function getCoinGlassData({
    ssm,
    coinglassSecretKey
}: {
    ssm: AWS.SSM,
    coinglassSecretKey: string
}): Promise<CoinGlassData> {
    let secret = await getCoinglassSecret({ ssm, coinglassSecretKey });

    let response = await fetch('https://open-api.coinglass.com/public/v2/funding', {
        method: "GET",
        headers: {
            "accept": "application/json",
            "coinglassSecret": secret
        }
    });

    let { data } = await response.json();
    let returnData: CoinGlassData = {};

    for (let i = 0; i < data.length; i++) {
        let entry = data[i];
        let symbol = entry.symbol;
        returnData[symbol] = {};

        let marginList = entry.uMarginList;
        for (let ii = 0; ii < marginList.length; ii++) {
            let marginData = marginList[ii];
            let exchange = marginData.exchangeName.toLowerCase();
            let rate = marginData.rate;
            if (!rate) continue;
            returnData[symbol][exchange] = rate;
        }
    }

    return returnData;
}

function calculateReturn({
    longFundRate,
    shortFundRate,
    longFee,
    shortFee,
    investment,
    leverage
}: {
    longFundRate: number,
    shortFundRate: number,
    longFee: number,
    shortFee: number,
    investment: number,
    leverage: number
}): number {
    let leveragedAmount = (investment * leverage) / 2;
    let longIncome = (leveragedAmount * longFundRate) - (leveragedAmount * longFee);
    let shortIncome = (leveragedAmount * shortFundRate) - (leveragedAmount * shortFee);
    return longIncome + shortIncome;
}

function calculateFee({
    longMaker,
    longTaker,
    shortMaker,
    shortTaker
}: {
    longMaker: number,
    longTaker: number,
    shortMaker: number,
    shortTaker: number
}): {
    longFee: number,
    shortFee: number,
    makerSide: 'long' | 'short'
} {
    if ((longMaker + shortTaker) < (longTaker + shortMaker)) return {
        longFee: longMaker,
        shortFee: shortTaker,
        makerSide: 'long'
    }
    return {
        longFee: longTaker,
        shortFee: shortMaker,
        makerSide: 'short'
    }
}

// function calculateMaxLeverage({
//     investment,
//     leverageTiers
// }: {
//     investment: number,
//     leverageTiers: LeverageTier[]
// }): number {
//     for (let i = leverageTiers.length - 1; i >= 0; i--) {
//         let leverageTier = leverageTiers[i];
//         if (leverageTier.maxLeverage * investment < leverageTier.maxNotional) continue;
//         return leverageTier.maxNotional / investment
//     }
//     return 1;
// }

function calculateRoi({
    pair1,
    pair2,
    investment
}: {
    pair1: FuturesCalculation,
    pair2: FuturesCalculation,
    investment: number
}): RoiTradePair {
    let { s: shortCalc, l: longCalc } = (pair1.rate < pair2.rate) ? { l: pair1, s: pair2 } : { l: pair2, s: pair1 };
    let { longFee, makerSide, shortFee } = calculateFee({ longMaker: longCalc.makerFee, shortMaker: shortCalc.makerFee, longTaker: longCalc.takerFee, shortTaker: shortCalc.takerFee });
    let leverage = Math.min(shortCalc.leverage, longCalc.leverage);
    let roi = calculateReturn({
        leverage,
        investment,
        longFee,
        shortFee,
        longFundRate: longCalc.rate,
        shortFundRate: shortCalc.rate
    });

    return {
        roi,
        makerSide,
        leverage,
        longExchange: longCalc.exchange,
        longSymbol: longCalc.symbol,
        shortExchange: shortCalc.exchange,
        shortSymbol: shortCalc.symbol
    };
}

export async function calculateBestRoiTradePair({
    minThreshold,
    exchanges,
    coins,
    exchangeCache,
    nextFundingHour,
    investment,
    coinGlassData
}: {
    minThreshold?: number,
    exchanges: string[],
    coins: string[],
    exchangeCache: { [exchange: string]: ExchangePro },
    nextFundingHour: number,
    coinGlassData: CoinGlassData,
    investment: number
}): Promise<RoiTradePair | undefined> {
    let bestTradePair: RoiTradePair | undefined = undefined;

    for (let i = 0; i < coins.length; i++) {
        let coin = coins[i];
        let coinCalculations: FuturesCalculation[] = [];
        for (let ii = 0; ii < exchanges.length; ii++) {
            let exchangeName = exchanges[ii];
            if (!(exchangeName in exchangeCache)) continue;

            let exchange = exchangeCache[exchangeName];
            let calculations = await (<GetFuturesCalculationFunction>exchange.GetFuturesCalculation)({
                coin,
                coinGlassData,
                investment,
                nextFundingHour
            });

            if (!calculations || calculations.length == 0) continue;
            coinCalculations = [...coinCalculations, ...calculations];
        }
        for (let outer = 0; outer < coinCalculations.length - 1; outer++) {
            for (let inner = (outer + 1); inner < coinCalculations.length; inner++) {
                let roi = calculateRoi({ investment, pair1: coinCalculations[outer], pair2: coinCalculations[inner] });
                if (roi.roi <= 0 || (minThreshold && roi.roi / investment < minThreshold)) continue;
                if (bestTradePair == undefined) {
                    bestTradePair = roi;
                    continue;
                }
                if (roi.roi < bestTradePair.roi) continue;
                bestTradePair = roi;
            }
        }
    }

    return bestTradePair;
};


export function getPositionSize(position: any | undefined): number {
    let contracts = (position?.contracts) ? parseFloat(position.contracts) : 0;
    let contractSize = (position?.contractSize) ? parseFloat(position.contractSize) : 1;
    return contractSize * contracts;
}

export async function openBuyOrdersSize(params: {
    exchange: ccxt.ExchangePro,
    symbol: string,
    position: any
}): Promise<number> {
    return openOrdersSize({ ...params, side: 'buy' });
}

export async function openSellOrdersSize(params: {
    exchange: ccxt.ExchangePro,
    symbol: string,
    position: any
}): Promise<number> {
    return openOrdersSize({ ...params, side: 'sell' });
}

export async function openOrdersSize({
    exchange,
    position,
    symbol,
    side
}: {
    exchange: ccxt.ExchangePro,
    symbol: string,
    position: any,
    side: Order['side']
}): Promise<number> {
    let contractSize = (position?.contractSize) ? parseFloat(position.contractSize) : 1;
    let orders = await exchange.fetchOpenOrders(symbol);
    if (!orders?.length) return 0;

    let totalContracts = orders.filter((o: any) => o.side == side && !o.triggerPrice).reduce((a, o) => a + ((o.remaining != undefined) ? o.remaining : o.amount), 0);
    return (totalContracts * contractSize);
}

export async function remainingToClose({
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
    let size = getPositionSize(position);
    let contractSize = (position?.contractSize) ? parseFloat(position.contractSize) : 1;
    if (position.info.close_left) return parseFloat(position.info.close_left);

    let orders = await exchange.fetchOpenStopOrders(symbol);
    if (!orders?.length) return size;

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

    if (triggerOrders.length == 0) return size;

    let totalContracts = triggerOrders.reduce((a, o) => a + ((o.remaining != undefined) ? o.remaining : o.amount), 0);
    return size - (totalContracts * contractSize);
}

export async function remainingTakeProfit(params: {
    exchange: ccxt.ExchangePro,
    position: any,
    symbol: string
}): Promise<number> {
    return remainingToClose({ ...params, triggerType: 'tp' });
}

export async function remainingStopLoss(params: {
    exchange: ccxt.ExchangePro,
    position: any,
    symbol: string
}): Promise<number> {
    return remainingToClose({ ...params, triggerType: 'sl' });
}

export function calculateOrderSizes({
    shortMarket,
    longMarket,
    longRequirement,
    shortRequirement,
    idealOrderSize
}: {
    shortMarket: ccxt.Market,
    longMarket: ccxt.Market,
    shortRequirement: number,
    longRequirement: number,
    idealOrderSize: number
}): {
    longSize: number;
    shortSize: number
    longOrderCount: number,
    shortOrderCount: number,
    trailingLong: number,
    trailingShort: number
} {
    if (shortRequirement > 0 && shortRequirement < idealOrderSize) idealOrderSize = shortRequirement;
    if (longRequirement > 0 && longRequirement < idealOrderSize) idealOrderSize = longRequirement;
    if (longMarket.limits.amount?.max && longMarket.limits.amount?.max < idealOrderSize) idealOrderSize = longMarket.limits.amount?.max;
    if (shortMarket.limits.amount?.max && shortMarket.limits.amount?.max < idealOrderSize) idealOrderSize = shortMarket.limits.amount?.max;

    let shortContractSize = (shortMarket?.contractSize) ? shortMarket.contractSize : 1;
    let longContractSize = (longMarket?.contractSize) ? longMarket.contractSize : 1;

    let shortRmdr = idealOrderSize % shortContractSize;
    let longRmdr = idealOrderSize % longContractSize;

    let longOrderCount = Math.floor(longRequirement / idealOrderSize);
    let shortOrderCount = Math.floor(shortRequirement / idealOrderSize);

    let shortLeftOver = shortRequirement % idealOrderSize;
    let longLeftOver = longRequirement % idealOrderSize;

    let trailingShort = (shortOrderCount * shortRmdr) + shortLeftOver;
    let trailingLong = (longOrderCount * longRmdr) + longLeftOver;

    shortOrderCount = shortOrderCount + Math.floor(trailingShort / idealOrderSize);
    longOrderCount = longOrderCount + Math.floor(trailingLong / idealOrderSize);

    trailingShort = Math.floor((trailingShort % idealOrderSize) / shortContractSize);
    trailingLong = Math.floor((trailingLong % idealOrderSize) / longContractSize);

    let longSize = Math.floor(idealOrderSize / longContractSize);
    let shortSize = Math.floor(idealOrderSize / shortContractSize);

    return {
        longSize,
        shortSize,
        longOrderCount,
        shortOrderCount,
        trailingLong,
        trailingShort
    }
}

export async function blockUntilOscillates({
    exchange,
    symbol,
    oscillationLimit = 3,
    timeout = 100
}: {
    exchange: ExchangePro,
    symbol: string,
    oscillationLimit?: number,
    timeout?: number
}): Promise<"up" | "down" | null> {
    let oscillationCount = 0;
    let pBid, pAsk, nBid, nAsk = 0;
    let nDirection: "up" | "down" | null = null;
    let pDirection: "up" | "down" | null = null;

    while (true) {
        await asyncSleep(timeout);
        nDirection = null;

        let ob = await exchange.fetchOrderBook(symbol, exchange.options.fetchOrderBookLimit);
        nBid = ob.bids[0][0];
        nAsk = ob.asks[0][0];

        if (!pAsk || !pBid) {
            pAsk = nAsk;
            pBid = nBid;
        }

        if (nBid > pAsk) nDirection = "up";
        if (nAsk < pBid) nDirection = "down"

        pAsk = nAsk;
        pBid = nBid;

        if (!pDirection) pDirection = nDirection;
        if (pDirection != nDirection || (!pDirection && !nDirection)) oscillationCount++
        if (nDirection) pDirection = nDirection;

        if (oscillationCount > oscillationLimit) return nDirection;
    }
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

async function blockUntilClosed({
    exchange,
    symbol,
    orderId,
    diffPct = 0,
    retryLimit = 0,
    timeout = 100
}: {
    exchange: ExchangePro,
    symbol: string,
    orderId: string,
    diffPct?: number,
    retryLimit?: number,
    timeout?: number
}): Promise<"closed" | "error" | "high" | "low"> {
    let retryCount = 0;

    while (true) {
        try {
            await asyncSleep(timeout);
            let order = await exchange.fetchOrder(orderId, symbol);
            if (order.status == 'closed' || order.status == 'canceled')
                return "closed";

            if (diffPct == 0) continue;

            let ob = await exchange.fetchOrderBook(order.symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];

            if (bestBid > (order.price * (1 + diffPct))) return "high";
            if (bestAsk < (order.price * (1 - diffPct))) return "low";
        }
        catch (error: any) {
            retryCount++;
            console.log(error);
            if (error.name == "ExchangeError" && error.message == "order not exists") return "error";
            if (error.name == "OrderNotFound" && error.message == "Order not found") return "error";
            if (retryCount > (retryLimit || 3)) return "error";
        }
    }
}

async function createImmediateOrder(params: CreateOrderDetails): Promise<ccxt.Order> {
    return await createLimitOrder({ ...params, immediate: true });
}

async function calculateLiquidationPrice({
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

    let size = getPositionSize(position);
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
    longMarket,
    longOrderCount,
    longPosition,
    longSize,
    longSymbol,
    shortExchange,
    shortMarket,
    shortOrderCount,
    shortPosition,
    shortSize,
    shortSymbol,
    trailingLong,
    trailingShort,
    limit,
    trigger
}: {
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
    longMarket: ccxt.Market,
    shortMarket: ccxt.Market,
    longPosition: any,
    shortPosition: any,
    limit: number,
    trigger: number
}) {

    let liquidationPrice = await calculateLiquidationPrice({ exchange: longExchange, position: longPosition, market: longMarket });
    let price = liquidationPrice * (1 + limit);
    let stopLossPrice = liquidationPrice * (1 + limit + trigger);

    for (let i = 0; i < longOrderCount; i++) {
        await createLimitOrder({
            exchange: longExchange,
            side: "sell",
            size: longSize,
            symbol: longSymbol,
            price,
            stopLossPrice,
            positionId: longPosition.id
        });
    }
    if (trailingLong > 0) {
        await createLimitOrder({
            exchange: longExchange,
            side: "sell",
            size: trailingLong,
            symbol: longSymbol,
            price,
            stopLossPrice,
            positionId: longPosition.id
        });
    }

    liquidationPrice = await calculateLiquidationPrice({ exchange: shortExchange, position: shortPosition, market: shortMarket });
    price = liquidationPrice * (1 - limit);
    stopLossPrice = liquidationPrice * (1 - limit - trigger);

    for (let i = 0; i < shortOrderCount; i++) {
        await createLimitOrder({
            exchange: shortExchange,
            side: "buy",
            size: shortSize,
            symbol: shortSymbol,
            price,
            stopLossPrice,
            positionId: shortPosition.id
        });
    }
    if (trailingShort > 0) {
        await createLimitOrder({
            exchange: shortExchange,
            side: "buy",
            size: trailingShort,
            symbol: shortSymbol,
            price,
            stopLossPrice,
            positionId: shortPosition.id
        });
    }
}

export async function createTpOrders({
    longExchange,
    longMarket,
    longOrderCount,
    longPosition,
    longSize,
    longSymbol,
    shortExchange,
    shortMarket,
    shortOrderCount,
    shortPosition,
    shortSize,
    shortSymbol,
    trailingLong,
    trailingShort,
    limit,
    trigger
}: {
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
    longMarket: ccxt.Market,
    shortMarket: ccxt.Market,
    longPosition: any,
    shortPosition: any,
    limit: number,
    trigger: number
}) {

    let liquidationPriceShort = await calculateLiquidationPrice({ exchange: shortExchange, position: shortPosition, market: shortMarket });
    let entryDiff = longPosition.entryPrice - shortPosition.entryPrice;

    let maxLong = liquidationPriceShort + entryDiff;
    let price = maxLong * (1 - limit);
    let takeProfitPrice = maxLong * (1 - limit - trigger);

    for (let i = 0; i < longOrderCount; i++) {
        await createLimitOrder({
            exchange: longExchange,
            side: "sell",
            size: longSize,
            symbol: longSymbol,
            price,
            takeProfitPrice,
            positionId: longPosition.id
        });
    }

    if (trailingLong > 0) {
        await createLimitOrder({
            exchange: longExchange,
            side: "sell",
            size: trailingLong,
            symbol: longSymbol,
            price,
            takeProfitPrice,
            positionId: longPosition.id
        });
    }

    let liquidationPriceLong = await calculateLiquidationPrice({ exchange: longExchange, position: longPosition, market: longMarket });

    let minShort = liquidationPriceLong - entryDiff;
    price = minShort * (1 + limit);
    takeProfitPrice = minShort * (1 + limit + trigger);

    for (let i = 0; i < shortOrderCount; i++) {
        await createLimitOrder({
            exchange: shortExchange,
            side: "buy",
            size: shortSize,
            symbol: shortSymbol,
            price,
            takeProfitPrice,
            positionId: shortPosition.id
        });
    }

    if (trailingShort > 0) {
        await createLimitOrder({
            exchange: shortExchange,
            side: "buy",
            size: trailingShort,
            symbol: shortSymbol,
            price,
            takeProfitPrice,
            positionId: shortPosition.id
        });
    }
}

export async function trailOrder({
    exchange,
    orderId,
    symbol,
    trailPct,
    retryLimit = 3
}: {
    exchange: ExchangePro,
    orderId: string,
    symbol: string,
    trailPct: number,
    retryLimit?: number
}) {
    let retryCount = 0;

    while (true) {
        try {
            let order = await exchange.fetchOrder(orderId, symbol);
            if (order.status == 'closed' || order.status == 'canceled')
                return;

            let ob = await exchange.fetchOrderBook(order.symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];

            if (order.side == 'buy' && bestAsk < (order.price * (1 + trailPct))) continue
            if (order.side == 'sell' && bestBid > (order.price * (1 - trailPct))) continue;

            let newPrice = order.side == 'buy' ? bestBid * (1 - trailPct) : bestAsk * (1 + trailPct);
            await exchange.cancelOrder(orderId, symbol);
            order = await createLimitOrder({ exchange, side: order.side, price: newPrice, size: order.amount, symbol })
            if (order.id != orderId) orderId = order.id;
        }
        catch (error: any) {
            retryCount++;
            console.log(error);
            if (error.name == "ExchangeError" && error.message == "order not exists") return;
            if (error.name == "OrderNotFound" && error.message == "Order not found") return;
            if (retryCount > (retryLimit || 3)) return;
        }
    }
}

export async function closePositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "buy", longSide: "sell", reduceOnly: true });
}

export async function openPositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "sell", longSide: "buy", reduceOnly: false });
}

export async function adjustPositions({
    longExchange,
    longSymbol,
    shortExchange,
    shortSymbol,
    longSize,
    longOrderCount,
    shortOrderCount,
    shortSize,
    trailingLong,
    trailingShort,
    makerSide,
    trailPct = 0.0001,
    shortSide = "sell",
    longSide = "buy",
    reduceOnly = false
}: AdjustPositionDetails) {
    let countDiff = Math.abs(longOrderCount - shortOrderCount);
    let orderCount = ((longOrderCount + shortOrderCount) - countDiff) / 2;
    let side: Order["side"] = longSide;
    let exchange: ccxt.pro.Exchange = longExchange;
    let symbol: string = longSymbol;
    let size: number = longSize;
    let takerSide: Order["side"] = shortSide;
    let takerExchange: ccxt.pro.Exchange = shortExchange;
    let takerSymbol: string = shortSymbol;
    let takerSize: number = shortSize;
    let trailSize: number = trailingLong;
    let takerTrailSize: number = trailingShort;

    if (countDiff > 0 && longOrderCount > shortOrderCount) {
        exchange = longExchange;
        symbol = longSymbol;
        size = longSize;
        side = longSide;
    }

    if (countDiff > 0 && shortOrderCount > longOrderCount) {
        exchange = shortExchange;
        symbol = shortSymbol;
        side = shortSide
        size = shortSize;
    }

    for (let i = 0; i < countDiff; i++) {
        await createImmediateOrder({ exchange, side, size, symbol, reduceOnly })
    }

    if (makerSide == "long") {
        exchange = longExchange;
        symbol = longSymbol;
        size = longSize;
        side = longSide;
        trailSize = trailingLong;

        takerExchange = shortExchange;
        takerSymbol = shortSymbol;
        takerSize = shortSize;
        takerSide = shortSide;
        takerTrailSize = trailingShort;
    }

    if (makerSide == "short") {
        exchange = shortExchange;
        symbol = shortSymbol;
        size = shortSize;
        side = shortSide;
        trailSize = trailingShort;

        takerExchange = longExchange;
        takerSymbol = longSymbol;
        takerSize = longSize;
        takerSide = longSide;
        takerTrailSize = trailingLong;
    }

    for (let i = 0; i < orderCount; i++) {
        let order = await createLimitOrder({ exchange, side, size, symbol, reduceOnly });

        while (true) {
            let result = await blockUntilClosed({ exchange, symbol, orderId: order.id, diffPct: trailPct });
            if (result == "closed") break;
            if (result == "error") continue;
            await exchange.cancelOrder(order.id, symbol);
            order = await createLimitOrder({ exchange, side, size, symbol, reduceOnly });
        }

        await createImmediateOrder({ exchange: takerExchange, side: takerSide, size: takerSize, symbol: takerSymbol, reduceOnly });
    }

    if (trailSize > 0) {
        let order = await createLimitOrder({ exchange, side, size: trailSize, symbol, reduceOnly });

        while (true) {
            let result = await blockUntilClosed({ exchange, symbol, orderId: order.id, diffPct: trailPct });
            if (result == "closed") break;
            if (result == "error") continue;
            await exchange.cancelOrder(order.id, symbol);
            order = await createLimitOrder({ exchange, side, size: trailSize, symbol, reduceOnly });
        }
    }

    if (takerTrailSize > 0) {
        await createImmediateOrder({ exchange: takerExchange, side: takerSide, size: takerTrailSize, symbol: takerSymbol, reduceOnly });
    }
}