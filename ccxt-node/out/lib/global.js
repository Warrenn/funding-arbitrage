import { setTimeout as asyncSleep } from 'timers/promises';
import { BinanceExchange, BybitExchange, CoinexExchange, GateExchange, OkxExchange } from './types.js';
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
    return ssm.putParameter({ Name: tradeStatusKey, Value: jsonValue }).promise();
}
export async function getTradeState({ ssm, tradeStatusKey }) {
    var _a;
    let ssmParam = await ssm.getParameter({ Name: `${tradeStatusKey}` }).promise();
    return JSON.parse(`${(_a = ssmParam.Parameter) === null || _a === void 0 ? void 0 : _a.Value}`);
}
export const factory = {
    "binance": async ({ ssm, apiCredentialsKeyPrefix }) => {
        let credentials = await getCredentials({ ssm, name: "binance", apiCredentialsKeyPrefix });
        let ex = new BinanceExchange({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
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
                fetchOrderBookLimit: 5
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
                fetchOrderBookLimit: 5
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
            options: { fetchOrderBookLimit: 5 }
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
            options: { fetchOrderBookLimit: 5 }
        });
        await ex.loadMarkets();
        return ex;
    }
};
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
    let leverage = Math.min(shortCalc.maxLeverage, longCalc.maxLeverage);
    let leveragedAmount = (investment * leverage) / 2;
    let longIncome = (leveragedAmount * longCalc.rate);
    let shortIncome = (leveragedAmount * shortCalc.rate);
    let roi = Math.abs(longIncome - shortIncome)
        - (leveragedAmount * longFee)
        - (leveragedAmount * shortFee);
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
        let maxLeverage = maxTradableNotion / investment;
        return {
            maxLeverage,
            tier
        };
    }
    let tier = leverageTiers[leverageTiers.length];
    let maxTradableNotion = (currentPrice) ?
        currentPrice * contractSize * tier.maxNotional :
        tier.maxNotional;
    let maxLeverage = maxTradableNotion / investment;
    return {
        maxLeverage,
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
export async function calculateBestRoiTradingPairs({ minThreshold, exchangeCache, investment, referenceData, fundingRates }) {
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
                let reference = referenceData[coin][exchangeName][symbol];
                let rate = fundingRates[coin][exchangeName][symbol];
                let leverageTiers = ((_a = reference.riskLevels) === null || _a === void 0 ? void 0 : _a.levels) || [];
                let contractSize = (_b = reference.riskLevels) === null || _b === void 0 ? void 0 : _b.contractSize;
                let currentPrice = undefined;
                if (((_c = reference.riskLevels) === null || _c === void 0 ? void 0 : _c.type) == 'base') {
                    currentPrice = (await exchange.fetchOHLCV(symbol, undefined, undefined, 1))[0][4];
                }
                let calculation = calculateMaxLeverage({ investment: investmentInLeg, leverageTiers, contractSize, currentPrice });
                let maxTierLeverage = calculation.tier.maxLeverage;
                let maxLeverage = calculation.maxLeverage;
                let riskIndex = `${calculation.tier.tier}`;
                let coinCalculation = {
                    exchange: exchangeName,
                    symbol,
                    maxTierLeverage,
                    makerFee: reference.makerFee,
                    takerFee: reference.takerFee,
                    maxLeverage,
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
                if (roi.roi <= 0 || (minThreshold && roi.roi / investment < minThreshold))
                    continue;
                coinTradePairs.push(roi);
            }
        }
        let sortedCoinPairs = coinTradePairs.sort((a, b) => a.roi - b.roi);
        let filteredPairs = [];
        let filteredSymbols = [];
        for (let i = 0; i < sortedCoinPairs.length; i++) {
            let roiTradePair = sortedCoinPairs[i];
            let longSymbol = roiTradePair.longSymbol;
            let shortSymbol = roiTradePair.shortSymbol;
            if (filteredSymbols.indexOf(longSymbol) > -1 || filteredSymbols.indexOf(shortSymbol) > -1)
                continue;
            filteredSymbols.push(longSymbol);
            filteredSymbols.push(shortSymbol);
            filteredPairs.push(roiTradePair);
        }
        bestTradingPairs = [...bestTradingPairs, ...filteredPairs];
    }
    let sortedPairs = bestTradingPairs.sort((a, b) => a.roi - b.roi);
    return sortedPairs;
}
;
export function getPositionSize(position) {
    let contracts = (position === null || position === void 0 ? void 0 : position.contracts) ? parseFloat(position.contracts) : 0;
    let contractSize = (position === null || position === void 0 ? void 0 : position.contractSize) ? parseFloat(position.contractSize) : 1;
    return contractSize * contracts;
}
export async function openBuyOrdersSize(params) {
    return openOrdersSize(Object.assign(Object.assign({}, params), { side: 'buy' }));
}
export async function openSellOrdersSize(params) {
    return openOrdersSize(Object.assign(Object.assign({}, params), { side: 'sell' }));
}
export async function openOrdersSize({ exchange, position, symbol, side }) {
    let contractSize = (position === null || position === void 0 ? void 0 : position.contractSize) ? parseFloat(position.contractSize) : 1;
    let orders = await exchange.fetchOpenOrders(symbol);
    if (!(orders === null || orders === void 0 ? void 0 : orders.length))
        return 0;
    let totalContracts = orders.filter((o) => o.side == side && !o.triggerPrice).reduce((a, o) => a + ((o.remaining != undefined) ? o.remaining : o.amount), 0);
    return (totalContracts * contractSize);
}
export async function remainingToClose({ exchange, position, symbol, triggerType }) {
    let size = getPositionSize(position);
    let contractSize = (position === null || position === void 0 ? void 0 : position.contractSize) ? parseFloat(position.contractSize) : 1;
    if (position.info.close_left)
        return parseFloat(position.info.close_left);
    let orders = await exchange.fetchOpenStopOrders(symbol);
    if (!(orders === null || orders === void 0 ? void 0 : orders.length))
        return size;
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
        return size;
    let totalContracts = triggerOrders.reduce((a, o) => a + ((o.remaining != undefined) ? o.remaining : o.amount), 0);
    return size - (totalContracts * contractSize);
}
export async function remainingTakeProfit(params) {
    return remainingToClose(Object.assign(Object.assign({}, params), { triggerType: 'tp' }));
}
export async function remainingStopLoss(params) {
    return remainingToClose(Object.assign(Object.assign({}, params), { triggerType: 'sl' }));
}
export function calculateOrderSizes({ shortMarket, longMarket, longRequirement, shortRequirement, idealOrderSize }) {
    var _a, _b, _c, _d, _e, _f;
    if (shortRequirement > 0 && shortRequirement < idealOrderSize)
        idealOrderSize = shortRequirement;
    if (longRequirement > 0 && longRequirement < idealOrderSize)
        idealOrderSize = longRequirement;
    if (((_a = longMarket.limits.amount) === null || _a === void 0 ? void 0 : _a.max) && ((_b = longMarket.limits.amount) === null || _b === void 0 ? void 0 : _b.max) < idealOrderSize)
        idealOrderSize = (_c = longMarket.limits.amount) === null || _c === void 0 ? void 0 : _c.max;
    if (((_d = shortMarket.limits.amount) === null || _d === void 0 ? void 0 : _d.max) && ((_e = shortMarket.limits.amount) === null || _e === void 0 ? void 0 : _e.max) < idealOrderSize)
        idealOrderSize = (_f = shortMarket.limits.amount) === null || _f === void 0 ? void 0 : _f.max;
    let shortContractSize = (shortMarket === null || shortMarket === void 0 ? void 0 : shortMarket.contractSize) ? shortMarket.contractSize : 1;
    let longContractSize = (longMarket === null || longMarket === void 0 ? void 0 : longMarket.contractSize) ? longMarket.contractSize : 1;
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
    };
}
export async function blockUntilOscillates({ exchange, symbol, oscillationLimit = 3, timeout = 100 }) {
    let oscillationCount = 0;
    let pBid, pAsk, nBid, nAsk = 0;
    let nDirection = null;
    let pDirection = null;
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
        if (nBid > pAsk)
            nDirection = "up";
        if (nAsk < pBid)
            nDirection = "down";
        pAsk = nAsk;
        pBid = nBid;
        if (!pDirection)
            pDirection = nDirection;
        if (pDirection != nDirection || (!pDirection && !nDirection))
            oscillationCount++;
        if (nDirection)
            pDirection = nDirection;
        if (oscillationCount > oscillationLimit)
            return nDirection;
    }
}
export async function createLimitOrder({ exchange, symbol, side, size, price = undefined, getPrice = undefined, reduceOnly = false, stopLossPrice = undefined, takeProfitPrice = undefined, positionId = undefined, retryLimit = 10, immediate = false }) {
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
    if (price)
        getPrice = ({}) => price;
    if (immediate && getPrice == undefined)
        getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? a : b;
    if (getPrice == undefined)
        getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? b : a;
    let retryCount = 0;
    while (true) {
        let order = null;
        try {
            let ob = await exchange.fetchOrderBook(symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];
            let price = getPrice({ side: side, bid: bestBid, ask: bestAsk });
            order = await exchange.createLimitOrder(symbol, side, size, price, params);
            if (!order)
                continue;
            if (!order.id && (stopLossPrice || takeProfitPrice)) {
                let position = await exchange.fetchPosition(symbol);
                if (stopLossPrice && position.info.stop_loss_price > 0)
                    return order;
                if (position.info.take_profit_price > 0)
                    return order;
                continue;
            }
            while (true) {
                try {
                    order = await exchange.fetchOrder(order.id, symbol);
                    if (!order)
                        continue;
                    if (order.status == 'open' || order.status == 'closed')
                        return order;
                    break;
                }
                catch (error) {
                    retryCount++;
                    console.log(error);
                    if (retryCount > retryLimit)
                        throw error;
                }
            }
        }
        catch (error) {
            retryCount++;
            console.log(error);
            if (retryCount > retryLimit)
                throw error;
        }
    }
}
export async function blockUntilClosed({ exchange, symbol, orderId, diffPct = 0, retryLimit = 0, timeout = 100 }) {
    let retryCount = 0;
    while (true) {
        try {
            await asyncSleep(timeout);
            let order = await exchange.fetchOrder(orderId, symbol);
            if (order.status == 'closed' || order.status == 'canceled')
                return "closed";
            if (diffPct == 0)
                continue;
            let ob = await exchange.fetchOrderBook(order.symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];
            if (bestBid > (order.price * (1 + diffPct)))
                return "high";
            if (bestAsk < (order.price * (1 - diffPct)))
                return "low";
        }
        catch (error) {
            retryCount++;
            console.log(error);
            if (error.name == "ExchangeError" && error.message == "order not exists")
                return "error";
            if (error.name == "OrderNotFound" && error.message == "Order not found")
                return "error";
            if (retryCount > (retryLimit || 3))
                return "error";
        }
    }
}
export async function createImmediateOrder(params) {
    return await createLimitOrder(Object.assign(Object.assign({}, params), { immediate: true }));
}
export async function calculateLiquidationPrice({ exchange, market, position }) {
    let liqPrice = position.liquidationPrice;
    if (liqPrice >= 0)
        return liqPrice;
    let size = getPositionSize(position);
    let balances = await exchange.fetchBalance({ type: market.type || 'swap' });
    let available = (('BUSD' in balances) ? balances['BUSD'].free : 0) +
        (('USDT' in balances) ? balances['USDT'].free : 0) +
        (('USDC' in balances) ? balances['USDC'].free : 0);
    liqPrice = (position.side == "long") ?
        position.markPrice - (available + position.initialMargin - position.maintenanceMargin) / size :
        position.markPrice + (available + position.initialMargin - position.maintenanceMargin) / size;
    return liqPrice;
}
export async function createSlOrders({ longExchange, longMarket, longOrderCount, longPosition, longSize, longSymbol, shortExchange, shortMarket, shortOrderCount, shortPosition, shortSize, shortSymbol, trailingLong, trailingShort, limit, trigger }) {
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
export async function createTpOrders({ longExchange, longMarket, longOrderCount, longPosition, longSize, longSymbol, shortExchange, shortMarket, shortOrderCount, shortPosition, shortSize, shortSymbol, trailingLong, trailingShort, limit, trigger }) {
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
export async function trailOrder({ exchange, orderId, symbol, trailPct, retryLimit = 3 }) {
    let retryCount = 0;
    while (true) {
        try {
            let order = await exchange.fetchOrder(orderId, symbol);
            if (order.status == 'closed' || order.status == 'canceled')
                return;
            let ob = await exchange.fetchOrderBook(order.symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];
            if (order.side == 'buy' && bestAsk < (order.price * (1 + trailPct)))
                continue;
            if (order.side == 'sell' && bestBid > (order.price * (1 - trailPct)))
                continue;
            let newPrice = order.side == 'buy' ? bestBid * (1 - trailPct) : bestAsk * (1 + trailPct);
            await exchange.cancelOrder(orderId, symbol);
            order = await createLimitOrder({ exchange, side: order.side, price: newPrice, size: order.amount, symbol });
            if (order.id != orderId)
                orderId = order.id;
        }
        catch (error) {
            retryCount++;
            console.log(error);
            if (error.name == "ExchangeError" && error.message == "order not exists")
                return;
            if (error.name == "OrderNotFound" && error.message == "Order not found")
                return;
            if (retryCount > (retryLimit || 3))
                return;
        }
    }
}
export async function closePositions(params) {
    return await adjustPositions(Object.assign(Object.assign({}, params), { shortSide: "buy", longSide: "sell", reduceOnly: true }));
}
export async function openPositions(params) {
    return await adjustPositions(Object.assign(Object.assign({}, params), { shortSide: "sell", longSide: "buy", reduceOnly: false }));
}
export async function adjustPositions({ longExchange, longSymbol, shortExchange, shortSymbol, longSize, longOrderCount, shortOrderCount, shortSize, trailingLong, trailingShort, makerSide, trailPct = 0.0001, shortSide = "sell", longSide = "buy", reduceOnly = false }) {
    let countDiff = Math.abs(longOrderCount - shortOrderCount);
    let orderCount = ((longOrderCount + shortOrderCount) - countDiff) / 2;
    let side = longSide;
    let exchange = longExchange;
    let symbol = longSymbol;
    let size = longSize;
    let takerSide = shortSide;
    let takerExchange = shortExchange;
    let takerSymbol = shortSymbol;
    let takerSize = shortSize;
    let trailSize = trailingLong;
    let takerTrailSize = trailingShort;
    if (countDiff > 0 && longOrderCount > shortOrderCount) {
        exchange = longExchange;
        symbol = longSymbol;
        size = longSize;
        side = longSide;
    }
    if (countDiff > 0 && shortOrderCount > longOrderCount) {
        exchange = shortExchange;
        symbol = shortSymbol;
        side = shortSide;
        size = shortSize;
    }
    for (let i = 0; i < countDiff; i++) {
        await createImmediateOrder({ exchange, side, size, symbol, reduceOnly });
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
            //block until the sum of executed amounts > 0
            //then immediately execute the same on other side to complete hedge
            // size
            let result = await blockUntilClosed({ exchange, symbol, orderId: order.id, diffPct: trailPct });
            if (result == "closed")
                break;
            if (result == "error")
                continue;
            await exchange.cancelOrder(order.id, symbol);
            order = await createLimitOrder({ exchange, side, size, symbol, reduceOnly });
        }
        await createImmediateOrder({ exchange: takerExchange, side: takerSide, size: takerSize, symbol: takerSymbol, reduceOnly });
    }
    if (trailSize > 0) {
        let order = await createLimitOrder({ exchange, side, size: trailSize, symbol, reduceOnly });
        while (true) {
            let result = await blockUntilClosed({ exchange, symbol, orderId: order.id, diffPct: trailPct });
            if (result == "closed")
                break;
            if (result == "error")
                continue;
            await exchange.cancelOrder(order.id, symbol);
            order = await createLimitOrder({ exchange, side, size: trailSize, symbol, reduceOnly });
        }
    }
    if (takerTrailSize > 0) {
        await createImmediateOrder({ exchange: takerExchange, side: takerSide, size: takerTrailSize, symbol: takerSymbol, reduceOnly });
    }
}
//# sourceMappingURL=global.js.map