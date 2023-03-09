import { setTimeout as asyncSleep } from 'timers/promises';
import { BinanceExchange } from './binance.js';
import { OkxExchange } from './okx.js';
import { BybitExchange } from './bybit.js';
import { GateExchange } from './gate.js';
import { CoinexExchange } from './coinex.js';
export async function getCredentials({ ssm, name, apiCredentialsKeyPrefix }) {
    var _a;
    let ssmParam = await ssm.getParameter({ Name: `${apiCredentialsKeyPrefix}${name}`, WithDecryption: true }).promise();
    return JSON.parse(`${(_a = ssmParam.Parameter) === null || _a === void 0 ? void 0 : _a.Value}`);
}
export async function getCoinglassSecret({ ssm, coinglassSecretKey }) {
    var _a;
    let ssmParam = await ssm.getParameter({ Name: coinglassSecretKey, WithDecryption: true }).promise();
    return ((_a = ssmParam.Parameter) === null || _a === void 0 ? void 0 : _a.Value) || "";
}
export async function saveTradeState({ ssm, state, tradeStatusKey }) {
    let jsonValue = JSON.stringify(state, undefined, 3);
    return ssm.putParameter({ Name: tradeStatusKey, Value: jsonValue, Overwrite: true }).promise();
}
export async function getTradeState({ ssm, tradeStatusKey }) {
    var _a;
    let ssmParam = await ssm.getParameter({ Name: `${tradeStatusKey}` }).promise();
    return JSON.parse(`${(_a = ssmParam.Parameter) === null || _a === void 0 ? void 0 : _a.Value}`);
}
export async function getSettings({ ssm, settingsPrefix }) {
    var _a;
    let ssmParam = await ssm.getParameter({ Name: `${settingsPrefix}` }).promise();
    return JSON.parse(`${(_a = ssmParam.Parameter) === null || _a === void 0 ? void 0 : _a.Value}`);
}
export const exchangeFactory = {
    "binance": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "binance", apiCredentialsKeyPrefix });
        let ex = new BinanceExchange({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: {
                fetchOrderBookLimit: 5,
                defaultMarginMode: 'isolated',
                fundingAccount: 'spot',
                tradingAccount: 'future',
                leaveBehind: 1
            }
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//))
            ex.setSandboxMode(true);
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
        if (apiCredentialsKeyPrefix.match(/\/dev\//))
            ex.setSandboxMode(true);
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
        if (apiCredentialsKeyPrefix.match(/\/dev\//))
            ex.setSandboxMode(true);
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
        if (apiCredentialsKeyPrefix.match(/\/dev\//))
            ex.setSandboxMode(true);
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
};
export async function sandBoxFundingRateLink(fundingRates, nextFundingHour) {
    let coins = Object.keys(fundingRates);
    for (let i = 0; i < coins.length; i++) {
        let coin = coins[i];
        if ('coinex' in fundingRates[coin])
            delete fundingRates[coin]['coinex'];
    }
    return fundingRates;
}
export async function getCoinGlassData({ ssm, coinglassSecretKey }) {
    let secret = await getCoinglassSecret({ ssm, coinglassSecretKey });
    return async function (fundingRates, nextFundingHour) {
        if ([0, 8, 16].indexOf(nextFundingHour) == -1)
            return fundingRates;
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
                if (!rate)
                    continue;
                fundingRates[symbol][exchange] = Object.assign({}, fundingRates[symbol][exchange]);
                fundingRates[symbol][exchange][`${symbol}/USDT:USDT`] = rate;
            }
        }
        return fundingRates;
    };
}
export function calculateRoi({ calculation1, calculation2, investment }) {
    let { longCalc, shortCalc } = (calculation1.rate < calculation2.rate) ?
        { longCalc: calculation1, shortCalc: calculation2 } :
        { longCalc: calculation2, shortCalc: calculation1 };
    let { longFee, shortFee, makerSide } = ((longCalc.makerFee + shortCalc.takerFee) < (longCalc.takerFee + shortCalc.makerFee)) ?
        {
            longFee: longCalc.makerFee,
            shortFee: shortCalc.takerFee,
            makerSide: 'long'
        } : {
        longFee: longCalc.takerFee,
        shortFee: shortCalc.makerFee,
        makerSide: 'short'
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
export function calculateMaxLeverage({ investment, leverageTiers, contractSize = 1, currentPrice }) {
    for (let i = leverageTiers.length - 1; i >= 0; i--) {
        let tier = leverageTiers[i];
        let leveragedInvestment = tier.maxLeverage * investment;
        let maxTradableNotion = (currentPrice) ?
            currentPrice * contractSize * tier.maxNotional :
            tier.maxNotional;
        if (leveragedInvestment < maxTradableNotion)
            continue;
        let calculatedLeverage = maxTradableNotion / investment;
        return {
            calculatedLeverage,
            tier
        };
    }
    let tier = leverageTiers[0];
    return {
        calculatedLeverage: tier.maxLeverage,
        tier
    };
}
export function processFundingRatesPipeline(processinglinks) {
    return async function ({ nextFundingHour }) {
        let fundingRates = {};
        for (let i = 0; i < processinglinks.length; i++) {
            let link = processinglinks[i];
            fundingRates = await link(fundingRates, nextFundingHour);
        }
        return fundingRates;
    };
}
export async function calculateBestRoiTradingPairs({ exchangeCache, investment, referenceData, fundingRates, minThreshold = 0, }) {
    var _a, _b, _c;
    let bestTradingPairs = [];
    let investmentInLeg = investment / 2;
    let coins = Object.keys(fundingRates);
    for (let coinIndex = 0; coinIndex < coins.length; coinIndex++) {
        let coin = coins[coinIndex];
        if (!(coin in referenceData))
            continue;
        let coinCalculations = [];
        let exchanges = Object.keys(fundingRates[coin]);
        for (let exchangeIndex = 0; exchangeIndex < exchanges.length; exchangeIndex++) {
            let exchangeName = exchanges[exchangeIndex];
            if (!(exchangeName in exchangeCache) || !(exchangeName in referenceData[coin]))
                continue;
            let exchange = exchangeCache[exchangeName];
            let pairs = Object.keys(fundingRates[coin][exchangeName]);
            for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
                let symbol = pairs[pairIndex];
                if (!(symbol in referenceData[coin][exchangeName]))
                    continue;
                if (!(symbol in exchange.markets))
                    continue;
                let reference = referenceData[coin][exchangeName][symbol];
                let rate = fundingRates[coin][exchangeName][symbol] / 100;
                let leverageTiers = ((_a = reference.riskLevels) === null || _a === void 0 ? void 0 : _a.levels) || [];
                let contractSize = (_b = reference.riskLevels) === null || _b === void 0 ? void 0 : _b.contractSize;
                let currentPrice = undefined;
                if (((_c = reference.riskLevels) === null || _c === void 0 ? void 0 : _c.type) == 'base') {
                    currentPrice = (await exchange.fetchOHLCV(symbol, undefined, undefined, 1))[0][4];
                }
                let calculation = calculateMaxLeverage({ investment: investmentInLeg, leverageTiers, contractSize, currentPrice });
                let maxLeverage = calculation.tier.maxLeverage;
                let calculatedLeverage = calculation.calculatedLeverage;
                let riskIndex = calculation.tier.tier;
                let coinCalculation = {
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
        let coinTradePairs = [];
        for (let outer = 0; outer < coinCalculations.length - 1; outer++) {
            for (let inner = (outer + 1); inner < coinCalculations.length; inner++) {
                let roi = calculateRoi({ investment, calculation1: coinCalculations[outer], calculation2: coinCalculations[inner] });
                if (roi.roi <= minThreshold)
                    continue;
                coinTradePairs.push(roi);
            }
        }
        let sortedCoinPairs = coinTradePairs.sort((a, b) => b.roi - a.roi);
        let filteredPairs = [];
        let filteredExchanges = [];
        for (let i = 0; i < sortedCoinPairs.length; i++) {
            let roiTradePair = sortedCoinPairs[i];
            let longExchange = roiTradePair.longExchange;
            let shortExchange = roiTradePair.shortExchange;
            if (filteredExchanges.indexOf(longExchange) > -1 || filteredExchanges.indexOf(shortExchange) > -1)
                continue;
            filteredExchanges.push(longExchange);
            filteredExchanges.push(shortExchange);
            filteredPairs.push(roiTradePair);
        }
        bestTradingPairs = [...bestTradingPairs, ...filteredPairs];
    }
    let sortedPairs = bestTradingPairs.sort((a, b) => b.roi - a.roi);
    return sortedPairs;
}
;
export async function sizeOfCloseOrdersPlaced({ exchange, symbol, triggerType }) {
    var _a, _b;
    let position = await exchange.fetchPosition(symbol) || {};
    if (triggerType == 'sl' && ((_a = position === null || position === void 0 ? void 0 : position.info) === null || _a === void 0 ? void 0 : _a.stop_loss_price) > 0) {
        return await getPositionSize({ exchange, symbol });
    }
    if (triggerType == 'tp' && ((_b = position === null || position === void 0 ? void 0 : position.info) === null || _b === void 0 ? void 0 : _b.take_profit_price) > 0) {
        return await getPositionSize({ exchange, symbol });
    }
    let orders = await exchange.fetchOpenStopOrders(symbol);
    if (!(orders === null || orders === void 0 ? void 0 : orders.length) || !position)
        return 0;
    let contractSize = exchange.market(symbol).contractSize || 1;
    let entryPrice = parseFloat(position.entryPrice);
    let side = position.side;
    let triggerOrders = [];
    if (triggerType == 'sl' && side == "long") {
        triggerOrders = orders.filter((o) => !!o.triggerPrice && o.triggerPrice < entryPrice);
    }
    if (triggerType == 'sl' && side == "short") {
        triggerOrders = orders.filter((o) => !!o.triggerPrice && o.triggerPrice > entryPrice);
    }
    if (triggerType == 'tp' && side == "long") {
        triggerOrders = orders.filter((o) => !!o.triggerPrice && parseFloat(o.triggerPrice) > entryPrice);
    }
    if (triggerType == 'tp' && side == "short") {
        triggerOrders = orders.filter((o) => !!o.triggerPrice && parseFloat(o.triggerPrice) < entryPrice);
    }
    if (triggerOrders.length == 0)
        return 0;
    let totalContracts = triggerOrders.reduce((a, o) => a + ((o.remaining != undefined) ? o.remaining : o.amount), 0);
    return totalContracts * contractSize;
}
export async function sizeOfTakeProfitOrders(params) {
    return sizeOfCloseOrdersPlaced(Object.assign(Object.assign({}, params), { triggerType: 'tp' }));
}
export async function sizeOfStopLossOrders(params) {
    return sizeOfCloseOrdersPlaced(Object.assign(Object.assign({}, params), { triggerType: 'sl' }));
}
export async function createOrder({ exchange, symbol, side, size, price = undefined, getPrice = undefined, reduceOnly = false, stopLossPrice = undefined, takeProfitPrice = undefined, positionId = undefined, immediate = false }) {
    let type = 'limit';
    let params = { type: 'limit', postOnly: true };
    if (immediate || stopLossPrice) {
        delete params.postOnly;
        params["timeInForce"] = "IOC";
    }
    if (reduceOnly)
        params['reduceOnly'] = true;
    if (stopLossPrice || takeProfitPrice)
        params['reduceOnly'] = true;
    if (stopLossPrice)
        params['stopLossPrice'] = stopLossPrice;
    if (takeProfitPrice)
        params['takeProfitPrice'] = takeProfitPrice;
    if (positionId)
        params['positionId'] = positionId;
    if (getPrice == undefined)
        getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? b : a;
    if (price)
        getPrice = undefined;
    if (immediate) {
        type = 'market';
        params.type = 'market';
        price = undefined;
        getPrice = undefined;
    }
    let order = null;
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
export async function createImmediateOrder(params) {
    return await createOrder(Object.assign(Object.assign({}, params), { immediate: true }));
}
export async function calculateLiquidationPrice({ exchange, market, position }) {
    let liqPrice = position.liquidationPrice;
    if (liqPrice >= 0)
        return +liqPrice;
    let size = (position.contracts || 0) * (market.contractSize || 1);
    let balances = await exchange.fetchBalance({ type: market.type || 'swap' });
    let available = (('BUSD' in balances) ? balances['BUSD'].free : 0) +
        (('USDT' in balances) ? balances['USDT'].free : 0) +
        (('USDC' in balances) ? balances['USDC'].free : 0);
    liqPrice = (position.side == "long") ?
        position.markPrice - (available + position.initialMargin - position.maintenanceMargin) / size :
        position.markPrice + (available + position.initialMargin - position.maintenanceMargin) / size;
    if (liqPrice < 0)
        return 0;
    return liqPrice;
}
export async function createSlOrders({ longExchange, longSymbol, shortExchange, shortSymbol, limit, trigger }) {
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
export async function createTpOrders({ longExchange, longSymbol, shortExchange, shortSymbol, limit, trigger }) {
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
export async function getPositionSize({ exchange, symbol }) {
    let market = exchange.market(symbol);
    let position = await exchange.fetchPosition(symbol);
    return ((position === null || position === void 0 ? void 0 : position.contracts) || 0) * (market.contractSize || 1);
}
export async function closePositions(params) {
    return await adjustPositions(Object.assign(Object.assign({}, params), { shortSide: "buy", longSide: "sell", reduceOnly: true, targetSize: 0 }));
}
export async function openPositions(params) {
    return await adjustPositions(Object.assign(Object.assign({}, params), { shortSide: "sell", longSide: "buy", reduceOnly: false }));
}
function calculateOrderSize({ idealSize, contractSize, maxSize, orderSize }) {
    orderSize = orderSize || 1;
    maxSize = maxSize || 1;
    idealSize = idealSize || 1;
    contractSize = contractSize || 1;
    orderSize = (orderSize > maxSize) ? maxSize : orderSize;
    orderSize = (orderSize > idealSize) ? idealSize : orderSize;
    orderSize = orderSize / contractSize;
    return orderSize;
}
function getLimits({ exchange, symbol }) {
    var _a, _b;
    let market = exchange.market(symbol);
    let contractSize = +(market.contractSize || 1);
    let maxSize = +(((_a = market.limits.amount) === null || _a === void 0 ? void 0 : _a.max) || 0);
    let minSize = +(((_b = market.limits.amount) === null || _b === void 0 ? void 0 : _b.min) || 0);
    if (!minSize)
        minSize = contractSize;
    if (!maxSize)
        maxSize = minSize;
    return {
        contractSize,
        maxSize,
        minSize
    };
}
export async function adjustUntilTargetMet({ target, getPositionSize, createOrder, idealSize, contractSize, maxSize, minSize, direction, sleepTimeout = 250, retryLimit = 10 }) {
    target = Math.abs(target);
    let previousSize = 0;
    while (true) {
        let currentSize = Math.abs(await getPositionSize());
        if (currentSize != 0 && target != 0 && previousSize != 0)
            console.log(`adjust til met: current:${currentSize} target:${target} previous:${previousSize}`);
        let retryCount = 0;
        while (previousSize == currentSize && currentSize != 0) {
            retryCount++;
            if (retryCount > retryLimit)
                throw "The postion has not changed size after creating order";
            asyncSleep(sleepTimeout);
            currentSize = Math.abs(await getPositionSize());
        }
        previousSize = currentSize;
        if (direction == undefined)
            direction = (currentSize < target) ? 'up' : 'down';
        let orderSize = Math.abs(currentSize - target);
        if ((orderSize < minSize) ||
            (direction == 'up' && currentSize > target) ||
            (direction == 'down' && currentSize < target))
            return;
        console.log(`adjust til met:calculating idealSize:${idealSize} contractSize:${contractSize} maxSize:${maxSize} orderSize:${orderSize}`);
        orderSize = calculateOrderSize({ idealSize, contractSize, maxSize, orderSize });
        console.log(`adjust til met:placing order with size:${orderSize}`);
        await createOrder(orderSize);
    }
}
export async function adjustPositions({ longExchange, longSymbol, shortExchange, shortSymbol, makerSide, reduceOnly, idealOrderValue, idealBatchSize = 1, targetSize = 0, shortSide = "sell", longSide = "buy", trailPct = 0.0001 }) {
    let { makerOrderSide, makerExchange, makerSymbol, takerOrderSide, takerExchange, takerSymbol } = (makerSide == 'long') ?
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
    if (!(makerSymbol in makerExchange.markets) || !(takerSymbol in takerExchange.markets))
        return;
    let { contractSize: makerContractSize, maxSize: makerMaxSize, minSize: makerMinSize } = getLimits({
        exchange: makerExchange,
        symbol: makerSymbol
    });
    let { contractSize: takerContractSize, maxSize: takerMaxSize, minSize: takerMinSize } = getLimits({
        exchange: takerExchange,
        symbol: takerSymbol
    });
    let balanceHedge = async () => {
        while (true) {
            let makerPositionSize = Math.abs(await getPositionSize({ exchange: makerExchange, symbol: makerSymbol }));
            if (makerPositionSize != 0)
                console.log(`adjust:balanceHedge: makerSize:${makerPositionSize}`);
            await adjustUntilTargetMet({
                target: makerPositionSize,
                idealSize: takerMaxSize,
                contractSize: takerContractSize,
                maxSize: takerMaxSize,
                minSize: takerMinSize,
                direction: (targetSize == 0) ? 'down' : 'up',
                getPositionSize: () => getPositionSize({ exchange: takerExchange, symbol: takerSymbol }),
                createOrder: (size) => createImmediateOrder({ exchange: takerExchange, side: takerOrderSide, size, symbol: takerSymbol, reduceOnly })
            });
            if ((Math.abs(makerPositionSize - targetSize) < makerMinSize) || (targetSize && makerPositionSize > targetSize))
                break;
        }
    };
    let placeOrders = async () => {
        var _a;
        while (true) {
            let currentPrice = (_a = (await makerExchange.fetchOHLCV(makerSymbol, undefined, undefined, 1))[0]) === null || _a === void 0 ? void 0 : _a[4];
            let makerIdealSize = idealOrderValue / (currentPrice || 1);
            let minTrailPrice = currentPrice * (1 - trailPct);
            let maxTrailPrice = currentPrice * (1 + trailPct);
            let orders = await makerExchange.fetchOpenOrders(makerSymbol);
            orders = orders.filter((o) => o.side == makerOrderSide && !o.triggerPrice);
            for (let i = 0; i < orders.length && currentPrice; i++) {
                let order = orders[i];
                if (!(order === null || order === void 0 ? void 0 : order.id) || !(order === null || order === void 0 ? void 0 : order.price))
                    continue;
                if (order.price > minTrailPrice && order.price < maxTrailPrice)
                    continue;
                console.log(`adjust:placeOrders canceling order for trailing ${order === null || order === void 0 ? void 0 : order.id}`);
                await makerExchange.cancelOrder(order.id, makerSymbol);
            }
            orders = (await makerExchange.fetchOpenOrders(makerSymbol)).filter((o) => o.side == makerOrderSide && !o.triggerPrice);
            let ordersInProgress = orders.length;
            let totalInOrders = orders.reduce((p, order) => p + Math.abs((order.remaining != undefined) ? order.remaining : order.amount), 0) * makerContractSize;
            let makerPositionSize = Math.abs(await getPositionSize({ exchange: makerExchange, symbol: makerSymbol }));
            if ((Math.abs(makerPositionSize - targetSize) < makerMinSize) || (targetSize && makerPositionSize > targetSize))
                break;
            let size = (targetSize == 0) ?
                (makerPositionSize - totalInOrders) :
                targetSize - (totalInOrders + makerPositionSize);
            console.log(`adjust:placeOrders size remaining: ${size}`);
            if (size < 0) {
                console.log(`adjust:placeOrders too many orders need to cancel size: ${size}`);
                orders = (await makerExchange.fetchOpenOrders(makerSymbol)).filter((o) => o.side == makerOrderSide && !o.triggerPrice);
                for (let i = 0; i < orders.length && currentPrice; i++) {
                    let order = orders[i];
                    if (!(order === null || order === void 0 ? void 0 : order.id) || !(order === null || order === void 0 ? void 0 : order.price))
                        continue;
                    await makerExchange.cancelOrder(order.id, makerSymbol);
                }
                continue;
            }
            if (size < makerMinSize)
                continue;
            if (ordersInProgress >= idealBatchSize)
                continue;
            size = calculateOrderSize({
                contractSize: makerContractSize,
                idealSize: makerIdealSize,
                maxSize: makerMaxSize,
                orderSize: size
            });
            console.log(`adjust:placeOrders placing maker order with calculated size: ${size}`);
            await createOrder({ exchange: makerExchange, side: makerOrderSide, size, symbol: makerSymbol, reduceOnly });
        }
    };
    await Promise.all([balanceHedge(), placeOrders()]);
    let orders = await makerExchange.fetchOpenOrders(makerSymbol);
    orders = orders.filter((o) => o.side == makerOrderSide && !o.triggerPrice);
    for (let i = 0; i < orders.length; i++) {
        let order = orders[i];
        await makerExchange.cancelOrder(order.id, makerSymbol);
    }
    let longMinSize = makerSide == 'long' ? makerMinSize : takerMinSize;
    let longPositionSize = Math.abs(await getPositionSize({ exchange: longExchange, symbol: longSymbol }));
    let longDiff = Math.abs(targetSize - longPositionSize);
    let size = calculateOrderSize({
        contractSize: makerSide == 'long' ? makerContractSize : takerContractSize,
        idealSize: makerSide == 'long' ? makerMaxSize : takerMaxSize,
        maxSize: makerSide == 'long' ? makerMaxSize : takerMaxSize,
        orderSize: longDiff
    });
    if (longDiff > longMinSize && longPositionSize > targetSize) {
        console.log(`long position too large need to adjust by ${longDiff}`);
        await createImmediateOrder({ exchange: longExchange, side: 'sell', size: size, symbol: longSymbol, reduceOnly: true });
    }
    if (longDiff > longMinSize && longPositionSize < targetSize) {
        console.log(`long position too small need to adjust by ${longDiff}`);
        await createImmediateOrder({ exchange: longExchange, side: 'buy', size: size, symbol: longSymbol, reduceOnly: true });
    }
    let shortMinSize = makerSide == 'short' ? makerMinSize : takerMinSize;
    let shortPositionSize = Math.abs(await getPositionSize({ exchange: shortExchange, symbol: shortSymbol }));
    let shortDiff = Math.abs(targetSize - shortPositionSize);
    size = calculateOrderSize({
        contractSize: makerSide == 'short' ? makerContractSize : takerContractSize,
        idealSize: makerSide == 'short' ? makerMaxSize : takerMaxSize,
        maxSize: makerSide == 'short' ? makerMaxSize : takerMaxSize,
        orderSize: shortDiff
    });
    if (shortDiff > shortMinSize && shortPositionSize > targetSize) {
        console.log(`short position too large need to adjust by ${shortDiff}`);
        await createImmediateOrder({ exchange: shortExchange, side: 'buy', size: size, symbol: shortSymbol, reduceOnly: true });
    }
    if (shortDiff > shortMinSize && shortPositionSize < targetSize) {
        console.log(`short position too small need to adjust by ${shortDiff}`);
        await createImmediateOrder({ exchange: shortExchange, side: 'sell', size: size, symbol: shortSymbol, reduceOnly: true });
    }
}
export async function findWithdrawal({ exchange, currency, address, timestamp, depositId, limit = 10 }) {
    let transactions = await exchange.fetchWithdrawals(currency, undefined, limit);
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i];
        if (depositId && transaction.id == depositId)
            return {
                depositId: transaction.id,
                depositTxId: transaction.txid
            };
        if (timestamp && transaction.timestamp >= timestamp && transaction.address == address)
            return {
                depositId: transaction.id,
                depositTxId: transaction.txid
            };
    }
    return { depositId, depositTxId: undefined };
}
export async function findWithdrawalByTime(params) {
    return await findWithdrawal(params);
}
export async function findWithdrawalById(params) {
    return await findWithdrawal(params);
}
export async function findDepositByTxId({ exchange, currency, depositTxId, limit = 10 }) {
    let transactions = await exchange.fetchDeposits(currency, undefined, limit);
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i];
        if (transaction.txid == depositTxId)
            return transaction;
    }
    return undefined;
}
export async function withdrawFunds({ address, currency, timestamp, network, depositAmount, depositId, depositTxId, withdrawalExchange, depositExchange, saveState, retryLimit = 360 }) {
    var _a, _b;
    if (!depositId) {
        ({ depositId, depositTxId } = await findWithdrawalByTime({
            address,
            currency,
            exchange: withdrawalExchange,
            timestamp
        }));
    }
    if (!depositTxId && !depositId) {
        let fundingBalace = await withdrawalExchange.fetchBalance({ type: withdrawalExchange.options.fundingAccount });
        let availableInFunding = ((_a = fundingBalace[currency]) === null || _a === void 0 ? void 0 : _a.free) || 0;
        let tradingBalance = await withdrawalExchange.fetchBalance({ type: withdrawalExchange.options.tradingAccount });
        let availableInTrading = ((_b = tradingBalance[currency]) === null || _b === void 0 ? void 0 : _b.free) || 0;
        if (!depositAmount && availableInTrading) {
            await withdrawalExchange.transfer(currency, availableInTrading, withdrawalExchange.options.tradingAccount, withdrawalExchange.options.fundingAccount);
        }
        if (depositAmount && availableInFunding < depositAmount) {
            let transferAmount = depositAmount - availableInFunding;
            if (availableInTrading < transferAmount)
                throw `Not enough funds available ${currency} ${depositAmount} in ${withdrawalExchange.id}`;
            await withdrawalExchange.transfer(currency, transferAmount, withdrawalExchange.options.tradingAccount, withdrawalExchange.options.fundingAccount);
        }
        if (!depositAmount)
            depositAmount = (availableInFunding + availableInTrading) - (withdrawalExchange.options.leaveBehind || 1);
        if (depositAmount <= 0)
            throw `Not enough funds available in ${withdrawalExchange.id}`;
        let params = { network };
        if (withdrawalExchange.options.withdrawalFee) {
            params['fee'] = withdrawalExchange.options.withdrawalFee;
        }
        let transactionResult = await withdrawalExchange.withdraw(currency, depositAmount, address, undefined, params);
        depositId = transactionResult.id;
        await saveState({ depositId, depositTxId });
    }
    let retryCount = 0;
    while (!depositTxId && depositId) {
        ({ depositId, depositTxId } = await findWithdrawalById({
            address,
            currency,
            exchange: withdrawalExchange,
            depositId
        }));
        if (depositTxId) {
            await saveState({ depositId, depositTxId });
            break;
        }
        retryCount++;
        if (retryCount > retryLimit)
            throw `${currency} withdrawal on ${withdrawalExchange.id} to address ${address} with id ${depositId} could not be found`;
        await asyncSleep(1000);
    }
    retryCount = 0;
    while (true) {
        let transaction = await findDepositByTxId({ exchange: depositExchange, currency, depositTxId });
        if ((transaction === null || transaction === void 0 ? void 0 : transaction.status) == 'ok')
            break;
        if (!transaction)
            retryCount++;
        if (retryCount > retryLimit)
            throw `${currency} deposit on ${depositExchange.id} with TxId ${depositTxId} could not be found`;
        await asyncSleep(5000);
    }
}
//# sourceMappingURL=global.js.map