import { setTimeout as asyncSleep } from 'timers/promises';
import ccxt from 'ccxt';
import AWS from 'aws-sdk';
import dotenv from "dotenv";
import { exit } from 'process';
dotenv.config({ override: true });
class binance2 extends ccxt.pro.binance {
    async fetchPosition(symbol, params) {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }
}
class gate2 extends ccxt.pro.gateio {
    async fetchOrder(id, symbol, params) {
        try {
            let order = await super.fetchOrder(id, symbol, params);
            if (order)
                return order;
        }
        catch (error) {
            console.log(error);
        }
        return await super.fetchOrder(id, symbol, Object.assign(Object.assign({}, params), { stop: true }));
    }
    async fetchPosition(symbol, params) {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }
}
class okx2 extends ccxt.pro.okex {
    async createLimitOrder(symbol, side, amount, price, params) {
        if (((params === null || params === void 0 ? void 0 : params.takeProfitPrice) || (params === null || params === void 0 ? void 0 : params.stopLossPrice)))
            delete params.postOnly;
        return await super.createLimitOrder(symbol, side, amount, price, params);
    }
    async fetchOrder(id, symbol, params) {
        let openParams = { ordType: 'conditional', algoId: id };
        const clientOrderId = this.safeString2(params, 'clOrdId', 'clientOrderId');
        if (clientOrderId)
            openParams['clOrdId'] = clientOrderId;
        try {
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1)
                return orders[0];
        }
        catch (err) {
            console.log(err);
        }
        try {
            openParams.ordType = "trigger";
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1)
                return orders[0];
        }
        catch (err) {
            console.log(err);
        }
        try {
            delete openParams.ordType;
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1)
                return orders[0];
        }
        catch (err) {
            console.log(err);
        }
        return await super.fetchOrder(id, symbol, params);
    }
}
const apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`, region = `${process.env.CCXT_NODE_REGION}`;
let ssm = new AWS.SSM({ region });
async function getCredentials({ ssm, name }) {
    var _a;
    let ssmParam = await ssm.getParameter({ Name: `${apiCredentialsKeyPrefix}${name}`, WithDecryption: true }).promise();
    return JSON.parse(`${(_a = ssmParam.Parameter) === null || _a === void 0 ? void 0 : _a.Value}`);
}
let factory = {
    "binance": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "binance" });
        return new binance2({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
    },
    "okx": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "okx" });
        return new okx2({
            secret: credentials.secret,
            apiKey: credentials.key,
            password: credentials.password,
            nonce: () => new Date((new Date()).toUTCString()).getTime(),
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
    },
    "bybit": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "bybit" });
        return new ccxt.pro.bybit({
            secret: credentials.secret,
            options: {
                'fetchTimeOffsetBeforeAuth': true,
                'recvWindow': 59999,
                fetchOrderBookLimit: 5
            },
            apiKey: credentials.key,
            enableRateLimit: true
        });
    },
    "gate": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "gate" });
        return new gate2({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
    },
    "coinex": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "coinex" });
        return new ccxt.pro.coinex({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
    }
};
let symbol = 'BNX/USDT:USDT';
let positionSize = 525;
let ex = await factory["bybit"]({ ssm });
let markets = await ex.loadMarkets();
let orders = await createSlOrders({ exchange: ex, limit: 0.001, trigger: 0.001, symbol });
console.log(orders);
// for (let i = 0; i < orders.length; i++) {
//     await ex.cancelOrder(orders[i].id, symbol);
// }
let ignore = [];
exit();
let factoryKeys = Object.keys(factory);
// for (let k = 6; k < factoryKeys.length; k++) {
//     let key = factoryKeys[k];
//     if (ignore.indexOf(key) > -1) continue;
//     let func = factory[key];
//     let exchange = await func({ ssm });
//     let markets = await exchange.loadMarkets();
// let key2 = factoryKeys[k + 1];
// let func2 = factory[key2];
// let ex2 = await func2({ ssm });
// let mk2 = await ex2.loadMarkets();
// let contractSize: number | undefined = markets[symbol].contractSize;
// let size = positionSize;
// if (contractSize) size = positionSize / contractSize;
// let direction = await blockUntilOscillates({ exchange, symbol, oscillationLimit: 3 });
// console.log(direction);
// let order = await createLimitOrder({ exchange, side: "buy", symbol, size });
// let closure = await blockUntilClosed({ exchange, orderId: `${order.id}`, symbol, diffPct: 0.0005 });
// let marketTiers = await exchange.fetchMarketLeverageTiers(symbol);
// console.log(key);
// console.log(JSON.stringify(marketTiers, undefined, 3));
// contractSize = mk2[symbol].contractSize;
// size = positionSize;
// if (contractSize) size = positionSize / contractSize;
// let order2 = await createLimitOrder({ exchange: ex2, side: "buy", symbol, size });
// let closure2 = await blockUntilClosed({ exchange: ex2, orderId: `${order2.id}`, symbol, diffPct: 0.0005 });
// let position2 = await ex2.fetchPosition(symbol);
// console.log(JSON.stringify(position2, undefined, 3));
// let liqPrice = position.liquidationPrice;
// if (!liqPrice) {
//     let balance: any = await exchange.fetchBalance({ type: 'swap' });
//     let available = Object.keys(balance.free).reduce((p, k) => p + balance.free[k], 0);
//     liqPrice = position.markPrice + (available + position.initialMargin - position.maintenanceMargin) / Math.abs(position.contracts * position.contractSize);
// }
//let slOrder = await createLimitOrder({ exchange, side: 'buy', symbol, size, price: liqPrice * 0.93, stopLossPrice: liqPrice * 0.9, positionId: position.id });
//let tpOrder = await createLimitOrder({ exchange, side: 'buy', symbol, size, price: position.entryPrice * 0.7, takeProfitPrice: position.entryPrice * 0.73, positionId: position.id });
//let closeOrder = await createLimitOrder({ exchange, side: "buy", symbol, size, reduceOnly: true, getPrice: ({ bid }) => Math.min(bid * 0.998, position.entryPrice * 0.998), positionId: position.id });
//break;
// }
//position.unrealizedPnl
//fetch balance
//fetch order"254294946405"
//trigger take profit maker only
//trigger stop loss maker only
//limit close position maker only
// console.log(mrks);
// let bOb = await bybitEx.fetchOrderBook(symbol, 5);
// let bPrice = (bOb.asks[0][0] + bOb.bids[0][0]) / 2;
// let bO = await bybitEx.createLimitSellOrder(symbol, 1800, bPrice, { "time_in_force": "PostOnly" });
// console.log(bO);
//get latest price
//have the funds amount
//have the leverage for that particular symbol and exchange (market?)
//find the smallest leverage between the exchanges
//size = floor((funds*leverage)/price)
// let exObLimit = 5;
// let side: Order["side"] = 'buy';
// let size = 1;
// let exMakerParams = {};
// let spreadRatioLimit = 3;
// async function generateSlInstructions({
//     shortExchange,
//     longExchange,
//     size,
//     symbolLong,
//     symbolShort,
//     makerSide
// }: {
//     shortExchange: ExchangePro,
//     longExchange: ExchangePro,
//     size: number,
//     symbolLong: string,
//     symbolShort: string,
//     makerSide: "long" | "short"
// }): Promise<InstructionPair[]> {
//     //fetch position of both sides
//     //get the latest price from both exchanges
//     //if position is still less than required
//     //make more position orders
// }
// async function generateCloseInstructions({
//     shortExchange,
//     longExchange,
//     size,
//     symbolLong,
//     symbolShort,
//     makerSide
// }: {
//     shortExchange: ExchangePro,
//     longExchange: ExchangePro,
//     size: number,
//     symbolLong: string,
//     symbolShort: string,
//     makerSide: "long" | "short"
// }): Promise<InstructionPair[]> {
//     //fetch position of both sides
//     //get the latest price from both exchanges
//     //if position is still less than required
//     //make more position orders
// }
function calculateOrderSizes({ shortMarket, longMarket, longRequirement, shortRequirement }) {
    var _a, _b, _c, _d, _e, _f;
    let maxSize = Math.max(shortRequirement, longRequirement);
    if (shortRequirement > 0 && shortRequirement < maxSize)
        maxSize = shortRequirement;
    if (longRequirement > 0 && longRequirement < maxSize)
        maxSize = longRequirement;
    if (((_a = longMarket.limits.amount) === null || _a === void 0 ? void 0 : _a.max) && ((_b = longMarket.limits.amount) === null || _b === void 0 ? void 0 : _b.max) < maxSize)
        maxSize = (_c = longMarket.limits.amount) === null || _c === void 0 ? void 0 : _c.max;
    if (((_d = shortMarket.limits.amount) === null || _d === void 0 ? void 0 : _d.max) && ((_e = shortMarket.limits.amount) === null || _e === void 0 ? void 0 : _e.max) < maxSize)
        maxSize = (_f = shortMarket.limits.amount) === null || _f === void 0 ? void 0 : _f.max;
    let shortContractSize = (shortMarket.contractSize && shortMarket.contractSize > 1) ?
        shortMarket.contractSize : 1;
    let longContractSize = (longMarket.contractSize && longMarket.contractSize > 1) ?
        longMarket.contractSize : 1;
    let shortRmdr = maxSize % shortContractSize;
    let longRmdr = maxSize % longContractSize;
    let longOrderCount = Math.floor(longRequirement / maxSize);
    let shortOrderCount = Math.floor(shortRequirement / maxSize);
    let shortLeftOver = shortRequirement % maxSize;
    let longLeftOver = longRequirement % maxSize;
    let trailingLong = (shortOrderCount * shortRmdr) + shortLeftOver;
    let trailingShort = (longOrderCount * longRmdr) + longLeftOver;
    shortOrderCount = shortOrderCount + Math.floor(trailingLong / maxSize);
    longOrderCount = longOrderCount + Math.floor(trailingShort / maxSize);
    trailingShort = Math.floor((trailingShort % maxSize) / shortContractSize);
    trailingLong = Math.floor((trailingLong % maxSize) / longContractSize);
    let longSize = Math.floor(maxSize / longContractSize);
    let shortSize = Math.floor(maxSize / shortContractSize);
    return {
        longSize,
        shortSize,
        longOrderCount,
        shortOrderCount,
        trailingLong,
        trailingShort
    };
}
async function blockUntilOscillates({ exchange, symbol, oscillationLimit = 3, timeout = 100 }) {
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
async function createLimitOrder({ exchange, symbol, side, size, price = undefined, getPrice = undefined, reduceOnly = false, stopLossPrice = undefined, takeProfitPrice = undefined, positionId = undefined, retryLimit = 3, immediate = false }) {
    let params = { type: 'limit', postOnly: true };
    if (immediate) {
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
        getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? (a * 1.02) : (b * 0.98);
    if (getPrice == undefined)
        getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? b : a;
    while (true) {
        let order = null;
        let retryCount = 0;
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
                order = await exchange.fetchOrder(order.id, symbol);
                if (!order)
                    continue;
                if (order.status == 'open' || order.status == 'closed')
                    return order;
                break;
            }
        }
        catch (error) {
            retryCount++;
            console.log(error);
            if (retryCount > (retryLimit || 3))
                throw error;
        }
    }
}
async function blockUntilClosed({ exchange, symbol, orderId, diffPct = 0, retryLimit = 0, timeout = 100 }) {
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
async function createImmediateOrder(params) {
    return await createLimitOrder(Object.assign(Object.assign({}, params), { immediate: true }));
}
async function calculateLiquidationPrice({ exchange, market, position }) {
    let liqPrice = position.liquidationPrice;
    if (liqPrice)
        return liqPrice;
    let size = Math.abs(position.contracts * position.contractSize);
    let balance = await exchange.fetchBalance({ type: `${market.type}` });
    let available = Object.keys(balance.free).reduce((p, k) => p + balance.free[k], 0);
    liqPrice = (position.side == "long") ?
        position.markPrice - (available + position.initialMargin - position.maintenanceMargin) / size :
        position.markPrice + (available + position.initialMargin - position.maintenanceMargin) / size;
    return liqPrice;
}
async function createSlOrders({ exchange, symbol, limit, trigger }) {
    let position = await exchange.fetchPosition(symbol);
    let market = exchange.markets[symbol];
    let size = Math.abs(position.contracts * position.contractSize);
    let liqPrice = position.liquidationPrice;
    if (!liqPrice) {
        let balance = await exchange.fetchBalance({ type: `${market.type}` });
        let available = Object.keys(balance.free).reduce((p, k) => p + balance.free[k], 0);
        liqPrice = (position.side == "long") ?
            position.markPrice - (available + position.initialMargin - position.maintenanceMargin) / size :
            position.markPrice + (available + position.initialMargin - position.maintenanceMargin) / size;
    }
    let price = liqPrice * (1 - limit - trigger);
    let stopLossPrice = liqPrice * (1 - trigger);
    let side = 'sell';
    if (position.side == "short") {
        price = liqPrice * (1 + limit + trigger);
        stopLossPrice = liqPrice * (1 + trigger);
        side = 'buy';
    }
    let orders = await createMultiOrders({ exchange, side, symbol, size, price, stopLossPrice, positionId: position.id });
    return orders;
}
async function trailOrder({ exchange, orderId, symbol, trailPct, retryLimit = 3 }) {
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
async function closePositions(params) {
    return await adjustPositions(Object.assign(Object.assign({}, params), { shortSide: "buy", longSide: "sell", reduceOnly: true }));
}
async function openPositions(params) {
    return await adjustPositions(Object.assign(Object.assign({}, params), { shortSide: "sell", longSide: "buy", reduceOnly: false }));
}
async function adjustPositions({ longExchange, longSymbol, shortExchange, shortSymbol, longSize, longOrderCount, shortOrderCount, shortSize, trailingLong, trailingShort, trailPct, makerSide, shortSide = "sell", longSide = "buy", reduceOnly = false }) {
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
            let result = await blockUntilClosed({ exchange, symbol, orderId: `${order.id}`, diffPct: trailPct });
            if (result == "closed")
                break;
            if (result == "error")
                continue;
            await exchange.cancelOrder(`${order.id}`, symbol);
            order = await createLimitOrder({ exchange, side, size, symbol, reduceOnly });
        }
        await createImmediateOrder({ exchange: takerExchange, side: takerSide, size: takerSize, symbol: takerSymbol, reduceOnly });
    }
    let order = await createLimitOrder({ exchange, side, size: trailSize, symbol, reduceOnly });
    while (true) {
        let result = await blockUntilClosed({ exchange, symbol, orderId: `${order.id}`, diffPct: trailPct });
        if (result == "closed")
            break;
        if (result == "error")
            continue;
        await exchange.cancelOrder(`${order.id}`, symbol);
        order = await createLimitOrder({ exchange, side, size: trailSize, symbol, reduceOnly });
    }
    await createImmediateOrder({ exchange: takerExchange, side: takerSide, size: takerTrailSize, symbol: takerSymbol, reduceOnly });
}
//There are two positions only one with a take profit and stop loss
//repeat the function above
//await past the funding data
//get the unrealized PnL of both positions
//get the difference of between them
//split that difference by two
//place a limit order where the buy is a little lower than bid by difference
//place a limit order where the sell is a little higher than ask by difference
//block until both positions are closed
//clean up any remaining take profit and stop loss on both exchanges
// let priceDiff = Math.abs(shortPosition.entryPrice - longPosition.entryPrice);
// let shortSLTrigger = shortPosition.liquidationPrice * (1 - (settings.liqLimitPct + settings.liqTriggerDiffPct));
// let shortSLLimit = shortPosition.liquidationPrice * (1 - settings.liqLimitPct);
// let longSLTrigger = longPosition.liquidationPrice * (1 + (settings.liqLimitPct + settings.liqTriggerDiffPct));
// let longSLLimit = longPosition.liquidationPrice * (1 + settings.liqLimitPct);
// let shortTPTrigger = longSLTrigger + ((shortPosition.entryPrice > longPosition.entryPrice) ? priceDiff : priceDiff * -1);
// let longTPTrigger = shortSLTrigger + ((shortPosition.entryPrice > longPosition.entryPrice) ? priceDiff * -1 : priceDiff);
// let shortTPLimit = longSLLimit + ((shortPosition.entryPrice > longPosition.entryPrice) ? priceDiff : priceDiff * -1);
// let longTPLimit = shortSLLimit + ((shortPosition.entryPrice > longPosition.entryPrice) ? priceDiff : priceDiff * -1);
//Place the short stop loss
//place the short take profit
//place the long stop loss
//place the long take profit
//await until the funding date time
//await until the market is not volatile
// [[shortPosition], [longPosition]] = await Promise.all([
//     shortExchange.fetchPositions([symbol]),
//     longExchange.fetchPositions([symbol])
// ]);
// let pnLDiff = Math.abs(shortPosition.uPnL - longPosition.uPnL) / 2;
//place a closing order for short
//place a closing order for long
//check maximum order size and work this for multiple orders
//see how to work this for multiple accounts
//adjust leverage
//cold starts and state
//check which will rally and which will not
//folow the one that rallies until it stops
//then place the order on the other exchange
//diversify the trades on multiple markets
//break into multi orders when the size doesnt fit
//%changes between ticks
//trail in a direction then reverse
//get direction first then trail in that direction until order is closed
//place in opposite direction and trail until order is closed
//limit on size as it relates to leverage
//limit on max size per order to place
//limit on total position as it relates to risk limit
//use the correction to market as a guide
//let order = await createOrder({ exchange, symbol, side: 'sell', size: 10, params: exchange.options.params });
//await trailOrder({ exchange, orderId: `${order?.id}`, symbol, trailPct: 0.0001 });
//remember to check limits before placing an order
//get leverage  and set leverage
//price: exchange.priceToPrecision(symbol, exchange.fetchTicker(symbol).last * (1 + trailingStop)),});
//get the entry value diff for the positions
//get the liquidation price from position
//for the buy exchange place a sell at liquidation of buy position
//for the sell exxhange place a sell at (liquidation-deff) of buy position
//for the sell exchange place a buy at liquidation of sell position
//for the buy exxhange place a buy at (liquidation-diff) of sell position
//when the time is up
//get the position of the two exchanges
//get the diff in entry price
//get the profit or loss of the one exchange
//get the profit or loss of the other exchange
//subract from each other
//take the diff and divide by 2
//stop limit for buy is best bid - diff
//stop limit for sell is best ask + diff
//read from the parameter store
//before the first funding round of the day - 30 minutes
//  if position is open and no close order
//    get the position of other exchange
//    get the close price of the other exchange
//    get the difference between the current price and close price
//    place an order better than the best bid or ask by diff
//  if both position are open see above
//  if postion is open and close order ignore
//after the first trigger funding time but before funding time
//  if no positions and no orders
//    check parameter for values
//    get the best trading pair from the coinglass server
//    move money to exchanges needed
//    place order as above
//after the funding round
//  close as above
//  withdrow money to central wallet
//binance: 'timeInForce' : 'GTX'
//bybit: 'timeInForce': 'PO' params= {"time_in_force": "PostOnly"}
//okx: order type: 'post_only'
//coinex: fetchOrders not working
//        need to test but { "reduceOnly":true, "option":"MAKER_ONLY"}
//        or  "effect_type": 4
//gate.io: "time_in_force": 'poc'/ "reduceOnly": true
//binance open orders and takes a symbol maybe try null?
//bybit orders
//okx fetchOpenOrders
//oks cant watchOrderBook
//investment opening time
//funding payment
//investment closing time
//if before opening after last closing
//  make sure no positions are open
//  if one open calculate the required
//if after opening and before closing and have a tradable pair
//  make sure there is a delta neutral between exchanges
//loop attempt to place an order make sure its a post only order
//watch orders
//if order of interest is cancelled try again
//if order is open
//get the latest bid and ask
//if the diff is too large
//  update the order
//if the order is closed return
//get the position
//split the difference and place the orders at halfway between exchanges
//get orders <fast></fast>
//get postions -> liqidation price
//place order -> postonly/makeronly
//close order -> reduceOnly/postonly/makeronly
//get latest bid/ask <fast></fast>https://www.okx.com/trade-market/position/futures
/*
{
  "market": "RNDRUSDT",
  "side": "buy",
  "price": "1.66",
  "amount": "20",
  "effect_type": 4,
  "hide": false
}*/ 
//# sourceMappingURL=index.js.map