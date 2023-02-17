import { setTimeout as asyncSleep } from 'timers/promises';
import ccxt, { ExchangePro, Order } from 'ccxt';
import AWS from 'aws-sdk';
import dotenv from "dotenv";
import { exit } from 'process';

dotenv.config({ override: true });

type GetPriceFunction = ({ side, bid, ask }: { side: Order["side"], bid: number, ask: number }) => number;
type ExchangeFactory = ({ ssm }: { ssm: AWS.SSM }) => Promise<ccxt.ExchangePro>;

type CreateOrderDetails = {
    exchange: ExchangePro,
    symbol: string,
    side: Order["side"],
    size: number,
    getPrice?: GetPriceFunction,
    reduceOnly?: boolean,
    stopLossPrice?: number,
    takeProfitPrice?: number,
    price?: number,
    positionId?: string,
    retryLimit?: number,
    immediate?: boolean
}

type AdjustPositionDetails = {
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
    makerSide: "long" | "short",
    trailPct?: number,
    reduceOnly?: boolean,
    shortSide?: Order["side"],
    longSide?: Order["side"]
}

class binance2 extends ccxt.pro.binance {
    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, params);
    }
}

class gate2 extends ccxt.pro.gateio {
    describe() {
        return this.deepExtend(super.describe(), {
            'urls': {
                'test': {
                    'public': {
                        'withdrawals': 'https://api.gateio.ws/api/v4',
                        'wallet': 'https://api.gateio.ws/api/v4',
                        'margin': 'https://api.gateio.ws/api/v4',
                        'spot': 'https://api.gateio.ws/api/v4',
                        'options': 'https://api.gateio.ws/api/v4',
                        'subAccounts': 'https://api.gateio.ws/api/v4',
                    },
                    'private': {
                        'withdrawals': 'https://api.gateio.ws/api/v4',
                        'wallet': 'https://api.gateio.ws/api/v4',
                        'margin': 'https://api.gateio.ws/api/v4',
                        'spot': 'https://api.gateio.ws/api/v4',
                        'options': 'https://api.gateio.ws/api/v4',
                        'subAccounts': 'https://api.gateio.ws/api/v4',
                    }
                }
            }
        });
    }

    async fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order> {
        try {
            let order = await super.fetchOrder(id, symbol, params);
            if (order) return order;
        }
        catch (error) {
            console.log(error);
        }

        return await super.fetchOrder(id, symbol, { ...params, stop: true });
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, { ...params, stop: true });
    }

    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let [position] = await super.fetchPositions([symbol], params);
        return position;
    }
}

class bybit2 extends ccxt.pro.bybit {

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, params);
    }
}

class coinex2 extends ccxt.pro.coinex {
    async fetchPosition(symbol: string, params?: ccxt.Params | undefined): Promise<any> {
        let position = await super.fetchPosition(symbol, params);
        if (position.contracts == undefined && !!position.contractSize) {
            position.contracts = parseFloat(position.contractSize);
            position.contractSize = 1;
        }
        return position;
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, params);
    }
}

class okx2 extends ccxt.pro.okex {
    async createOrder(symbol: string, type: Order['type'], side: Order['side'], amount: number, price?: number, params?: ccxt.Params) {
        if ((params?.takeProfitPrice || params?.stopLossPrice)) {
            delete params.postOnly;
            delete params.timeInForce;
        }
        return await super.createOrder(symbol, type, side, amount, price, params);
    }

    async fetchOpenStopOrders(symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> {
        return super.fetchOpenOrders(symbol, since, limit, { ...params, ordType: 'conditional' });
    }

    async fetchOrder(id: string, symbol: string, params?: ccxt.Params | undefined): Promise<ccxt.Order> {
        let openParams: any = { ordType: 'conditional', algoId: id };
        const clientOrderId = this.safeString2(params, 'clOrdId', 'clientOrderId');
        if (clientOrderId) openParams['clOrdId'] = clientOrderId;

        try {
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1) return orders[0];
        } catch (err) {
            console.log(err);
        }

        try {
            openParams.ordType = "trigger";
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1) return orders[0];
        } catch (err) {
            console.log(err);
        }

        try {
            delete openParams.ordType;
            let orders = await this.fetchOpenOrders(symbol, undefined, 1, openParams);
            if (orders.length == 1) return orders[0];
        } catch (err) {
            console.log(err);
        }

        return await super.fetchOrder(id, symbol, params);
    }
}

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
        let ex = new binance2({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        return ex;
    },
    "okx": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "okx" });
        let ex = new okx2({
            secret: credentials.secret,
            apiKey: credentials.key,
            password: credentials.password,
            nonce: () => new Date((new Date()).toUTCString()).getTime(),
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        return ex;
    },
    "bybit": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "bybit" });
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
        return ex;
    },
    "gate": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "gate" });
        let ex = new gate2({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
        if (apiCredentialsKeyPrefix.match(/\/dev\//)) ex.setSandboxMode(true);
        return ex;
    },
    "coinex": async ({ ssm }) => {
        let credentials = await getCredentials({ ssm, name: "coinex" });
        return new coinex2({
            secret: credentials.secret,
            apiKey: credentials.key,
            enableRateLimit: true,
            options: { fetchOrderBookLimit: 5 }
        });
    }
}

let symbol = 'ETH/USDT:USDT'
let positionSize = 10;

let longExchange = await factory["binance"]({ ssm });
let longMarkets = await longExchange.loadMarkets();
let longMarket = longMarkets[symbol];
let longPosition = await longExchange.fetchPosition(symbol);

let shortExchange = await factory["bybit"]({ ssm });
let shortMarkets = await shortExchange.loadMarkets();
let shortMarket = shortMarkets[symbol];
let shortPosition = await shortExchange.fetchPosition(symbol);

let currentLongSize = getPositionSize(longPosition);
let currentShortSize = getPositionSize(shortPosition);

let longRequirement = positionSize - currentLongSize;
let shortRequirement = positionSize - currentShortSize;

let longBuySize = await openBuyOrdersSize({ exchange: longExchange, symbol, position: longPosition });
let shortSellSize = await openSellOrdersSize({ exchange: shortExchange, symbol, position: shortPosition });

longRequirement = longRequirement - longBuySize;
shortRequirement = shortRequirement - shortSellSize;

let {
    longOrderCount,
    longSize,
    shortSize,
    shortOrderCount,
    trailingLong,
    trailingShort
} = calculateOrderSizes({
    idealOrderSize: 2,
    longMarket,
    shortMarket,
    longRequirement,
    shortRequirement
});

await openPositions({
    longExchange,
    longOrderCount,
    longSize,
    longSymbol: symbol,
    shortExchange,
    shortOrderCount,
    shortSize,
    trailingLong,
    trailingShort,
    shortSymbol: symbol,
    makerSide: 'long'
});

longPosition = await longExchange.fetchPosition(symbol);
shortPosition = await shortExchange.fetchPosition(symbol);

let remainingShortSl = await remainingStopLoss({ exchange: shortExchange, position: shortPosition, symbol });
let remainingLongSl = await remainingStopLoss({ exchange: longExchange, position: longPosition, symbol });

({
    longOrderCount,
    longSize,
    shortSize,
    shortOrderCount,
    trailingLong,
    trailingShort
} = calculateOrderSizes({
    idealOrderSize: 3,
    longMarket,
    shortMarket,
    longRequirement: remainingLongSl,
    shortRequirement: remainingShortSl
}));

await createSlOrders({
    limit: 0.005,
    trigger: 0.005,
    longExchange,
    longMarket,
    longOrderCount,
    longPosition,
    longSize,
    longSymbol: symbol,
    shortExchange,
    shortMarket,
    shortOrderCount,
    shortPosition,
    shortSize,
    shortSymbol: symbol,
    trailingLong,
    trailingShort
});

let remainingShortTp = await remainingTakeProfit({ exchange: shortExchange, position: shortPosition, symbol });
let remainingLongTp = await remainingTakeProfit({ exchange: longExchange, position: longPosition, symbol });

({
    longOrderCount,
    longSize,
    shortSize,
    shortOrderCount,
    trailingLong,
    trailingShort
} = calculateOrderSizes({
    idealOrderSize: 4,
    longMarket,
    shortMarket,
    longRequirement: remainingLongTp,
    shortRequirement: remainingShortTp
}));

await createTpOrders({
    limit: 0.005,
    trigger: 0.005,
    longExchange,
    longMarket,
    longOrderCount,
    longPosition,
    longSize,
    longSymbol: symbol,
    shortExchange,
    shortMarket,
    shortOrderCount,
    shortPosition,
    shortSize,
    shortSymbol: symbol,
    trailingLong,
    trailingShort
});

await asyncSleep(5000);

longPosition = await longExchange.fetchPosition(symbol);
shortPosition = await shortExchange.fetchPosition(symbol);

longRequirement = getPositionSize(longPosition);
shortRequirement = getPositionSize(shortPosition);

let longSellSize = await openSellOrdersSize({ exchange: longExchange, symbol, position: longPosition });
let shortBuySize = await openBuyOrdersSize({ exchange: shortExchange, symbol, position: shortPosition });

longRequirement = longRequirement - longSellSize;
shortRequirement = shortRequirement - shortBuySize;

({
    longOrderCount,
    longSize,
    shortSize,
    shortOrderCount,
    trailingLong,
    trailingShort
} = calculateOrderSizes({
    idealOrderSize: 6,
    longMarket,
    shortMarket,
    longRequirement,
    shortRequirement
}));

await closePositions({
    longExchange,
    longOrderCount,
    longSize,
    longSymbol: symbol,
    shortExchange,
    shortOrderCount,
    shortSize,
    trailingLong,
    trailingShort,
    shortSymbol: symbol,
    makerSide: 'short'
});

await longExchange.cancelAllOrders(symbol, { stop: true });
await shortExchange.cancelAllOrders(symbol, { stop: true });

console.log('checkup');

//reduce only
//sl if price < entry position is long
//sl if price > entry position is short

//binance
//when no position
// position.contracts == 0; position.contractSize = 1;
//when no orders
// [];
//trans[0].remaining 
//position.side == "short" && trans[0].type=='stop' && trans[0].price > position.entryPrice
//position.side == "long" && trans[0].type=='stop' && trans[0].price < position.entryPrice
/*
{
  info: {
    orderId: "1010186900",
    symbol: "ETHUSDT",
    status: "NEW",
    clientOrderId: "m8AHx7veNXUBeZRrFiKPSw",
    price: "4717.29",
    avgPrice: "0",
    origQty: "1",
    executedQty: "0",
    cumQuote: "0",
    timeInForce: "IOC",
    type: "STOP",
    reduceOnly: true,
    closePosition: false,
    side: "BUY",
    positionSide: "BOTH",
    stopPrice: "4669.64",
    workingType: "CONTRACT_PRICE",
    priceProtect: false,
    origType: "STOP",
    time: "1676544359949",
    updateTime: "1676544359949",
  },
  id: "1010186900",
  clientOrderId: "m8AHx7veNXUBeZRrFiKPSw",
  timestamp: 1676544359949,
  datetime: "2023-02-16T10:45:59.949Z",
  lastTradeTimestamp: undefined,
  symbol: "ETH/USDT:USDT",
  type: "stop",
  timeInForce: "IOC",
  postOnly: false,
  reduceOnly: true,
  side: "buy",
  price: 4717.29,
  triggerPrice: 4669.64,
  amount: 1,
  cost: 0,
  average: undefined,
  filled: 0,
  remaining: 1,
  status: "open",
  fee: undefined,
  trades: [
  ],
  fees: [
  ],
}
*/

//bybit
//when no position
// position.contracts == undefined; position.contractSize == undefined;
//trans[0].remaining//trans[1].stopPrice
/*
[
  {
    info: {
      symbol: "ETHUSDT",
      orderType: "Limit",
      orderLinkId: "",
      orderId: "1022c8f6-a315-4135-821a-9189d8ab9db0",
      stopOrderType: "UNKNOWN",
      orderStatus: "New",
      takeProfit: "",
      cumExecValue: "0.00000000",
      blockTradeId: "",
      price: "1693.93000000",
      createdTime: "1676542464083",
      tpTriggerBy: "UNKNOWN",
      timeInForce: "PostOnly",
      basePrice: "",
      updatedTime: "1676542464091",
      side: "Sell",
      triggerPrice: "",
      cumExecFee: "0.00000000",
      slTriggerBy: "UNKNOWN",
      leavesQty: "1.0000",
      closeOnTrigger: false,
      cumExecQty: "0.00000000",
      reduceOnly: false,
      qty: "1.0000",
      stopLoss: "",
      triggerBy: "UNKNOWN",
      orderIM: "",
    },
    id: "1022c8f6-a315-4135-821a-9189d8ab9db0",
    clientOrderId: undefined,
    timestamp: 1676542464083,
    datetime: "2023-02-16T10:14:24.083Z",
    lastTradeTimestamp: undefined,
    symbol: "ETH/USDT:USDT",
    type: "limit",
    timeInForce: "PO",
    postOnly: true,
    side: "sell",
    price: 1693.93,
    stopPrice: undefined,
    triggerPrice: undefined,
    amount: 1,
    cost: 0,
    average: undefined,
    filled: 0,
    remaining: 1,
    status: "open",
    fee: {
      cost: 0,
      currency: "USDT",
    },
    trades: [
    ],
    fees: [
      {
        cost: 0,
        currency: "USDT",
      },
    ],
  },
  {
    info: {
      symbol: "ETHUSDT",
      orderType: "Limit",
      orderLinkId: "",
      orderId: "c3fed97b-bd41-49e7-a7c0-b5bf029f30df",
      stopOrderType: "Stop",
      orderStatus: "Untriggered",
      takeProfit: "",
      cumExecValue: "0.00000000",
      blockTradeId: "",
      price: "1032.70000000",
      createdTime: "1676545111622",
      tpTriggerBy: "UNKNOWN",
      timeInForce: "ImmediateOrCancel",
      basePrice: "1042.94000000",
      updatedTime: "1676545111622",
      side: "Sell",
      triggerPrice: "1042.93000000",
      cumExecFee: "0.00000000",
      slTriggerBy: "UNKNOWN",
      leavesQty: "1.0000",
      closeOnTrigger: false,
      cumExecQty: "0.00000000",
      reduceOnly: true,
      qty: "1.0000",
      stopLoss: "",
      triggerBy: "LastPrice",
      orderIM: "",
    },
    id: "c3fed97b-bd41-49e7-a7c0-b5bf029f30df",
    clientOrderId: undefined,
    timestamp: 1676545111622,
    datetime: "2023-02-16T10:58:31.622Z",
    lastTradeTimestamp: undefined,
    symbol: "ETH/USDT:USDT",
    type: "limit",
    timeInForce: "IOC",
    postOnly: false,
    side: "sell",
    price: 1032.7,
    stopPrice: "1042.93000000",
    triggerPrice: "1042.93000000",
    amount: 1,
    cost: 0,
    average: undefined,
    filled: 0,
    remaining: 1,
    status: "open",
    fee: {
      cost: 0,
      currency: "USDT",
    },
    trades: [
    ],
    fees: [
      {
        cost: 0,
        currency: "USDT",
      },
    ],
  },
]
*/

//okx
//when no position
// position == undefined
/*
[
  {
    info: {
      activePx: "",
      actualPx: "",
      actualSide: "",
      actualSz: "0",
      algoId: "546446951596773376",
      cTime: "1676555105754",
      callbackRatio: "",
      callbackSpread: "",
      ccy: "",
      clOrdId: "e847386590ce4dBCb6f82f2af4f98d7c",
      closeFraction: "",
      instId: "ETH-USDT-SWAP",
      instType: "SWAP",
      last: "1680.69",
      lever: "3",
      moveTriggerPx: "",
      ordId: "0",
      ordPx: "",
      ordType: "conditional",
      posSide: "net",
      pxLimit: "",
      pxSpread: "",
      pxVar: "",
      quickMgnType: "",
      reduceOnly: "true",
      side: "buy",
      slOrdPx: "10485.02",
      slTriggerPx: "10379.11",
      slTriggerPxType: "last",
      state: "live",
      sz: "100",
      szLimit: "",
      tag: "e847386590ce4dBC",
      tdMode: "cross",
      tgtCcy: "",
      timeInterval: "",
      tpOrdPx: "",
      tpTriggerPx: "",
      tpTriggerPxType: "",
      triggerPx: "",
      triggerPxType: "",
      triggerTime: "",
    },
    id: "546446951596773376",
    clientOrderId: "e847386590ce4dBCb6f82f2af4f98d7c",
    timestamp: 1676555105754,
    datetime: "2023-02-16T13:45:05.754Z",
    lastTradeTimestamp: undefined,
    symbol: "ETH/USDT:USDT",
    type: "conditional",
    timeInForce: undefined,
    postOnly: undefined,
    side: "buy",
    price: undefined,
    stopPrice: 10379.11,
    triggerPrice: 10379.11,
    average: undefined,
    cost: undefined,
    amount: 100,
    filled: undefined,
    remaining: undefined,
    status: "open",
    fee: undefined,
    trades: [
    ],
    reduceOnly: true,
    fees: [
    ],
  },
]
*/

//gate
//when no position
// position == undefined
/*
 [
  {
    id: "82590",
    clientOrderId: undefined,
    timestamp: 1676570520000,
    datetime: "2023-02-16T18:02:00.000Z",
    lastTradeTimestamp: 1676570520000,
    status: "open",
    symbol: "ETH/USDT:USDT",
    type: "limit",
    timeInForce: "IOC",
    postOnly: false,
    reduceOnly: undefined,
    side: "sell",
    price: 705.75,
    stopPrice: 712.7,
    triggerPrice: 712.7,
    average: undefined,
    amount: 100,
    cost: 0,
    filled: 0,
    remaining: 100,
    fee: undefined,
    fees: [
    ],
    trades: [
    ],
    info: {
      user: "13005419",
      trigger: {
        strategy_type: "0",
        price_type: "0",
        price: "712.7",
        rule: "2",
        expiration: "0",
      },
      initial: {
        contract: "ETH_USDT",
        size: "-100",
        price: "705.75",
        tif: "ioc",
        text: "",
        iceberg: "0",
        is_close: false,
        is_reduce_only: true,
        auto_size: "",
      },
      id: "82590",
      trade_id: "0",
      status: "open",
      reason: "",
      create_time: "1676570520",
      finish_time: "1676570520",
      is_stop_order: false,
      stop_trigger: {
        rule: "0",
        trigger_price: "",
        order_price: "",
      },
      me_order_id: "0",
      order_type: "",
    },
  },
]
 */

//coinex
//when no position
// position.contracts == undefined; position.contractSize == undefined;
/*
{
  info: {
    adl_sort: "44",
    adl_sort_val: "0.05617248",
    amount: "100",
    amount_max: "100",
    amount_max_margin: "11.39460000000000000000",
    bkr_price: "2.42209514858453999999",
    bkr_price_imply: "0.45578399999999999999",
    close_left: "100",
    create_time: "1676573183.220349",
    deal_all: "34.18380000000000000000",
    deal_asset_fee: "0.00000000000000000000",
    fee_asset: "",
    finish_type: "1",
    first_price: "0.341838",
    insurance: "0.00000000000000000000",
    latest_price: "0.341838",
    leverage: "3",
    liq_amount: "0.00000000000000000000",
    liq_order_price: "0",
    liq_order_time: "0",
    liq_price: "2.41867676858453999999",
    liq_price_imply: "0.45236561999999999999",
    liq_profit: "0.00000000000000000000",
    liq_time: "0",
    mainten_margin: "0.01",
    mainten_margin_amount: "0.34183800000000000000",
    maker_fee: "0.00030",
    margin_amount: "11.39460000000000000000",
    market: "SXPUSDT",
    open_margin: "6.08550584950924121952",
    open_margin_imply: "0.33333333333333333333",
    open_price: "0.34183800000000000000",
    open_val: "34.18380000000000000000",
    open_val_max: "34.18380000000000000000",
    position_id: "207876113",
    profit_clearing: "-0.01709190000000000000",
    profit_real: "-0.01709190000000000000",
    profit_unreal: "0.052500",
    side: "1",
    stop_loss_price: "2.370303",
    stop_loss_type: "1",
    sys: "0",
    take_profit_price: "0.00000000000000000000",
    take_profit_type: "0",
    taker_fee: "0.00050",
    total: "49",
    type: "2",
    update_time: "1676573183.220612",
    user_id: "4637301",
  },
  id: 207876113,
  symbol: "SXP/USDT",
  notional: undefined,
  marginMode: "cross",
  liquidationPrice: "2.41867676858453999999",
  entryPrice: "0.34183800000000000000",
  unrealizedPnl: "0.052500",
  percentage: undefined,
  contracts: undefined,
  contractSize: "100",
  markPrice: undefined,
  side: "short",
  hedged: undefined,
  timestamp: 1676573183220,
  datetime: "2023-02-16T18:46:23.220Z",
  maintenanceMargin: "0.34183800000000000000",
  maintenanceMarginPercentage: "0.01",
  collateral: "11.39460000000000000000",
  initialMargin: undefined,
  initialMarginPercentage: undefined,
  leverage: 3,
  marginRatio: undefined,
}

{
  info: {
    adl_sort: "43",
    adl_sort_val: "0.05617248",
    amount: "100",
    amount_max: "100",
    amount_max_margin: "11.39460000000000000000",
    bkr_price: "2.42209514858453999999",
    bkr_price_imply: "0.45578399999999999999",
    close_left: "100",
    create_time: "1676573183.220349",
    deal_all: "34.18380000000000000000",
    deal_asset_fee: "0.00000000000000000000",
    fee_asset: "",
    finish_type: "1",
    first_price: "0.341838",
    insurance: "0.00000000000000000000",
    latest_price: "0.341838",
    leverage: "3",
    liq_amount: "0.00000000000000000000",
    liq_order_price: "0",
    liq_order_time: "0",
    liq_price: "2.41867676858453999999",
    liq_price_imply: "0.45236561999999999999",
    liq_profit: "0.00000000000000000000",
    liq_time: "0",
    mainten_margin: "0.01",
    mainten_margin_amount: "0.34183800000000000000",
    maker_fee: "0.00030",
    margin_amount: "11.39460000000000000000",
    market: "SXPUSDT",
    open_margin: "6.08550584950924121952",
    open_margin_imply: "0.33333333333333333333",
    open_price: "0.34183800000000000000",
    open_val: "34.18380000000000000000",
    open_val_max: "34.18380000000000000000",
    position_id: "207876113",
    profit_clearing: "-0.01709190000000000000",
    profit_real: "-0.01709190000000000000",
    profit_unreal: "0.053600",
    side: "1",
    stop_loss_price: "2.370303",
    stop_loss_type: "1",
    sys: "0",
    take_profit_price: "0.200000",
    take_profit_type: "1",
    taker_fee: "0.00050",
    total: "49",
    type: "2",
    update_time: "1676573183.220612",
    user_id: "4637301",
  },
  id: 207876113,
  symbol: "SXP/USDT",
  notional: undefined,
  marginMode: "cross",
  liquidationPrice: "2.41867676858453999999",
  entryPrice: "0.34183800000000000000",
  unrealizedPnl: "0.053600",
  percentage: undefined,
  contracts: undefined,
  contractSize: "100",
  markPrice: undefined,
  side: "short",
  hedged: undefined,
  timestamp: 1676573183220,
  datetime: "2023-02-16T18:46:23.220Z",
  maintenanceMargin: "0.34183800000000000000",
  maintenanceMarginPercentage: "0.01",
  collateral: "11.39460000000000000000",
  initialMargin: undefined,
  initialMarginPercentage: undefined,
  leverage: 3,
  marginRatio: undefined,
}
*/


let ignore: string[] = [];

exit();

function getPositionSize(position: any | undefined): number {
    let contracts = (position?.contracts) ? parseFloat(position.contracts) : 0;
    let contractSize = (position?.contractSize) ? parseFloat(position.contractSize) : 1;
    return contractSize * contracts;
}

async function openBuyOrdersSize(params: {
    exchange: ccxt.ExchangePro,
    symbol: string,
    position: any
}): Promise<number> {
    return openOrdersSize({ ...params, side: 'buy' });
}

async function openSellOrdersSize(params: {
    exchange: ccxt.ExchangePro,
    symbol: string,
    position: any
}): Promise<number> {
    return openOrdersSize({ ...params, side: 'sell' });
}
async function openOrdersSize({
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

async function remainingToClose({
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

async function remainingTakeProfit(params: {
    exchange: ccxt.ExchangePro,
    position: any,
    symbol: string
}): Promise<number> {
    return remainingToClose({ ...params, triggerType: 'tp' });
}

async function remainingStopLoss(params: {
    exchange: ccxt.ExchangePro,
    position: any,
    symbol: string
}): Promise<number> {
    return remainingToClose({ ...params, triggerType: 'sl' });
}

function calculateOrderSizes({
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

async function blockUntilOscillates({
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

async function createSlOrders({
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

async function createTpOrders({
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

async function trailOrder({
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

async function closePositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "buy", longSide: "sell", reduceOnly: true });
}

async function openPositions(params: AdjustPositionDetails) {
    return await adjustPositions({ ...params, shortSide: "sell", longSide: "buy", reduceOnly: false });
}

async function adjustPositions({
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

//see how to work this for multiple accounts
//adjust leverage
//cold starts and state

//remember to check limits before placing an order
//get leverage  and set leverage

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

//openingEvent
//fundingEvent
//closingEvent