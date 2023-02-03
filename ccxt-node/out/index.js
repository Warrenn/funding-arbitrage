var _a, _b;
import ccxt from 'ccxt';
import AWS from 'aws-sdk';
import dotenv from "dotenv";
dotenv.config({ override: true });
const apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`, region = `${process.env.CCXT_NODE_REGION}`;
const coinexId = 'coinex', bybitId = 'bybit', coinexCredKey = `${apiCredentialsKeyPrefix}${coinexId}`, bybitCredKey = `${apiCredentialsKeyPrefix}${bybitId}`;
// let ex = new ccxt.pro.okex({
//     apiKey: "",
//     secret: "",
//     password: "",
//     'headers': { 'x-simulated-trading': 1 },
//     nonce: () => new Date((new Date()).toUTCString()).getTime(),
// });
// ex.setSandboxMode(true);
let ssm = new AWS.SSM({ region });
let coinexCredParam = await ssm.getParameter({ Name: coinexCredKey, WithDecryption: true }).promise();
const coinexCred = JSON.parse(`${(_a = coinexCredParam.Parameter) === null || _a === void 0 ? void 0 : _a.Value}`);
let bybitCredParam = await ssm.getParameter({ Name: bybitCredKey, WithDecryption: true }).promise();
const bybitCred = JSON.parse(`${(_b = bybitCredParam.Parameter) === null || _b === void 0 ? void 0 : _b.Value}`);
let bybitEx = new ccxt.pro.bybit({
    secret: bybitCred.secret,
    options: {
        'fetchTimeOffsetBeforeAuth': true,
        'recvWindow': 59999
    },
    apiKey: bybitCred.key,
    enableRateLimit: true,
});
let coinEx = new ccxt.pro.coinex({
    apiKey: coinexCred.key,
    secret: coinexCred.secret,
    enableRateLimit: true,
    options: {
        createOrderparams: {
            "option": "1",
            "effectType": 4
        },
        fetchOrderBookLimit: 5
    }
});
let symbol = 'RNDR/USDT:USDT';
//await bybitEx.loadMarkets();
await coinEx.loadMarkets();
let exchange = coinEx;
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
async function createOrder({ exchange, symbol, side, size }) {
    while (true) {
        let order = null;
        try {
            let ob = await coinEx.fetchOrderBook(symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];
            let price = (bestBid + bestAsk) / 2;
            order = await exchange.createLimitOrder(symbol, side, size, price, exchange.options.createOrderparams);
            if (!(order === null || order === void 0 ? void 0 : order.id))
                continue;
            order = await exchange.fetchOrder(order.id, symbol);
            if (order.status != 'canceled')
                return order;
        }
        catch (error) {
            console.log(error);
        }
    }
}
async function trailOrder({ exchange, orderId, symbol, trailPct }) {
    while (true) {
        try {
            let order = await exchange.fetchOrder(orderId, symbol);
            if (order.status == 'closed') {
                return;
            }
            let ob = await exchange.fetchOrderBook(order.symbol, exchange.options.fetchOrderBookLimit);
            let bestBid = ob.bids[0][0];
            let bestAsk = ob.asks[0][0];
            if ((order.side == 'buy' && bestAsk < (order.price * (1 + trailPct))) ||
                (order.side == 'sell' && bestBid > (order.price * (1 - trailPct))))
                continue;
            let newPrice = order.side == 'buy' ? bestAsk * (1 - trailPct) : bestBid * (1 + trailPct);
            order = await exchange.editOrder(orderId, symbol, order.type, order.side, order.amount, newPrice);
            if (order.id != orderId)
                orderId = order.id;
        }
        catch (error) {
            console.log(error);
            if (error.name == "ExchangeError" && error.message == "order not exists")
                return;
            if (error.name == "OrderNotFound" && error.message == "Order not found")
                return;
        }
    }
}
//let order = await createOrder({ exchange, symbol, side: 'sell', size: 10, params: exchange.options.params });
//await trailOrder({ exchange, orderId: `${order?.id}`, symbol, trailPct: 0.0001 });
let position = await coinEx.fetchPosition(symbol);
console.log(position.liquidationPrice);
console.log(position.averageEntryPrice);
let m = exchange.market(symbol);
console.log(m);
//remember to check limits before placing an order
//get leverage  and set leverage
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
//id:251801456351
//# sourceMappingURL=index.js.map