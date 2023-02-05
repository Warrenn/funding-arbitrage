import { setTimeout as asyncSleep } from 'timers/promises';
import ccxt, { ExchangePro, Exchange, ExchangeId, Market } from 'ccxt';
import AWS from 'aws-sdk';
import dotenv from "dotenv";

dotenv.config({ override: true });

type GetPriceFunction = ({ side, bid, ask }: { side: "buy" | "sell", bid: number, ask: number }) => number;
type ExchangeFactory = ({ ssm }: { ssm: AWS.SSM }) => Promise<ccxt.ExchangePro>;

const
    apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`,
    region = `${process.env.CCXT_NODE_REGION}`;

let ssm = new AWS.SSM({ region });

async function getCredentials({ ssm, name }: { ssm: AWS.SSM, name: string }): Promise<any> {
    let ssmParam = await ssm.getParameter({ Name: `${apiCredentialsKeyPrefix}${name}`, WithDecryption: true }).promise();
    return JSON.parse(`${ssmParam.Parameter?.Value}`);
}

let factory: { [key: string]: ExchangeFactory } = {
    "binance": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "binance" });
        return new ccxt.pro.binanceusdm({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
    },
    "okx": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "okx" });
        return new ccxt.pro.okex({
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
        return new ccxt.pro.gateio({
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
}

let symbol = 'XRP/USDT:USDT'
let size = 50;
let ignore: string[] = [];

let factoryKeys = Object.keys(factory);
for (let k = 0; k < factoryKeys.length; k++) {
    let key = factoryKeys[k];
    if (ignore.indexOf(key) > -1) continue;
    let func = factory[key];
    let exchange = await func({ ssm });
    let markets = await exchange.loadMarkets();
    let order = await createLimitOrder({ exchange, side: "sell", symbol, size });
    await trailOrder({ exchange, orderId: `${order.id}`, symbol, trailPct: 0.005 });
    let [position] = await exchange.fetchPositions([symbol]);
    let slOrder = await createLimitOrder({ exchange, side: 'buy', symbol, size, price: position.liquidationPrice * 0.95, stopLossPrice: position.liquidationPrice * 0.9, positionId: position.id });
    let tpOrder = await createLimitOrder({ exchange, side: 'buy', symbol, size, price: position.averageEntryPrice * 1.05, takeProfitPrice: position.averageEntryPrice * 1.1, positionId: position.id });
}

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
// let side: "buy" | "sell" = 'buy';
// let size = 1;
// let exMakerParams = {};
// let spreadRatioLimit = 3;

async function createLimitOrder({
    exchange,
    symbol,
    side,
    size,
    price = undefined,
    getPrice = undefined,
    reduceOnly = false,
    stopLossPrice = undefined,
    takeProfitPrice = undefined,
    positionId = undefined
}: {
    exchange: ExchangePro,
    symbol: string,
    side: "buy" | "sell",
    size: number,
    getPrice?: GetPriceFunction,
    reduceOnly?: boolean,
    stopLossPrice?: number,
    takeProfitPrice?: number,
    price?: number,
    positionId?: string
}): Promise<ccxt.Order> {

    let params: any = { type: 'limit', postOnly: true };

    if (reduceOnly) params['reduceOnly'] = true;
    if (stopLossPrice || takeProfitPrice) params['reduceOnly'] = true;
    if (stopLossPrice) params['stopLossPrice'] = stopLossPrice;
    if (takeProfitPrice) params['takeProfitPrice'] = takeProfitPrice;
    if (positionId) params['positionId'] = positionId;
    if (price) getPrice = ({ }) => price;
    if (getPrice == undefined) getPrice = ({ side: s, bid: b, ask: a }) => s == 'buy' ? b : a;

    while (true) {
        let order: ccxt.Order | null = null;
        try {
            let ob = await exchange.fetchOrderBook(symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];
            let price = getPrice({ side: side, bid: bestBid, ask: bestAsk });
            order = await exchange.createLimitOrder(symbol, side, size, price, params);
            if (!order?.id) continue;
            order = await exchange.fetchOrder(order.id, symbol);
            if (order.status == 'open')
                return order;
        }
        catch (error) {
            console.log(error);
        }
    }
}

async function trailOrder({
    exchange,
    orderId,
    symbol,
    trailPct
}: {
    exchange: ExchangePro,
    orderId: string,
    symbol: string,
    trailPct: number
}) {
    while (true) {
        try {
            let order = await exchange.fetchOrder(orderId, symbol);
            if (order.status == 'closed') {
                return;
            }
            let ob = await exchange.fetchOrderBook(order.symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];

            if (order.side == 'buy' && bestAsk < (order.price * (1 + trailPct))) continue
            if (order.side == 'sell' && bestBid > (order.price * (1 - trailPct))) continue;

            let newPrice = order.side == 'buy' ? bestBid * (1 - trailPct) : bestAsk * (1 + trailPct);
            order = await exchange.editOrder(orderId, symbol, order.type, order.side, order.amount, newPrice);
            if (order.id != orderId) orderId = order.id;
        }
        catch (error: any) {
            console.log(error);
            if (error.name == "ExchangeError" && error.message == "order not exists") return;
            if (error.name == "OrderNotFound" && error.message == "Order not found") return;
        }
    }
}

async function arbritage({
    shortExchange,
    longExchange,
    size,
    symbol,
    settings
}: {
    shortExchange: ExchangePro,
    longExchange: ExchangePro,
    size: number,
    symbol: string,
    settings: {
        trailPct: number,
        liqLimitPct: number,
        liqTriggerDiffPct: number,
    }
}) {



    //TODO: find direction first then place order keep trailing until closed then place other keep trailing until closed
    // let [sellOrder, buyOrder] = await Promise.all([
    //     createOrder({ exchange: shortExchange, symbol, side: 'sell', size }),
    //     createOrder({ exchange: buyExchange, symbol, side: 'buy', size })
    // ]);

    // await Promise.all([
    //     trailOrder({ exchange: shortExchange, orderId: `${sellOrder.id}`, symbol, trailPct: settings.trailPct }),
    //     trailOrder({ exchange: buyExchange, orderId: `${buyOrder.id}`, symbol, trailPct: settings.trailPct })
    // ]);

    let shortPosition = await shortExchange.fetchPosition(symbol);
    let longPosition = await longExchange.fetchPosition(symbol);

    let priceDiff = Math.abs(shortPosition.averageEntryPrice - longPosition.averageEntryPrice);
    let shortSLTrigger = shortPosition.liquidationPrice * (1 - (settings.liqLimitPct + settings.liqTriggerDiffPct));
    let shortSLLimit = shortPosition.liquidationPrice * (1 - settings.liqLimitPct);

    let longSLTrigger = longPosition.liquidationPrice * (1 + (settings.liqLimitPct + settings.liqTriggerDiffPct));
    let longSLLimit = longPosition.liquidationPrice * (1 + settings.liqLimitPct);

    let shortTPTrigger = longSLTrigger + ((shortPosition.averageEntryPrice > longPosition.averageEntryPrice) ? priceDiff : priceDiff * -1);
    let longTPTrigger = shortSLTrigger + ((shortPosition.averageEntryPrice > longPosition.averageEntryPrice) ? priceDiff * -1 : priceDiff);

    let shortTPLimit = longSLLimit + ((shortPosition.averageEntryPrice > longPosition.averageEntryPrice) ? priceDiff : priceDiff * -1);
    let longTPLimit = shortSLLimit + ((shortPosition.averageEntryPrice > longPosition.averageEntryPrice) ? priceDiff : priceDiff * -1);

    //Place the short stop loss
    //place the short take profit
    //place the long stop loss
    //place the long take profit

    //await until the funding date time
    //await until the market is not volatile
    [shortPosition, longPosition] = await Promise.all([
        shortExchange.fetchPosition(symbol),
        longExchange.fetchPosition(symbol)
    ]);

    let pnLDiff = Math.abs(shortPosition.uPnL - longPosition.uPnL) / 2;

    //place a closing order for short
    //place a closing order for long
}

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
//get latest bid/ask <fast></fast>

/*
{
  "market": "RNDRUSDT",
  "side": "buy",
  "price": "1.66",
  "amount": "20",
  "effect_type": 4,
  "hide": false
}*/