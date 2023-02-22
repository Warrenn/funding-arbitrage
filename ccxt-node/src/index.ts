import { setTimeout as asyncSleep } from 'timers/promises';
import ccxt, { ExchangePro, Order } from 'ccxt';
import { factory } from './main';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const
    apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`,
    tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`,
    coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`,
    region = `${process.env.CCXT_NODE_REGION}`;

let ssm = new AWS.SSM({ region });



// let tp = await getBestTradingPair({
//     ignoreSymbols: ['1000SHIB', 'SHIB1000', 'PHB', '1000BONK', 'BTCDOM', 'HT', 'TWT', 'T', 'TON', 'ILV', 'FOOTBALL', 'USDC'],
//     ignoreExchanges: ['dydx', 'bitget']
// });
let symbol = "ETH/USDT:USDT";

let bin = await factory["binance"]({ ssm, apiCredentialsKeyPrefix });
let binTeirs = await bin.fetchLeverageTiers([symbol]);
console.log(binTeirs);

let bb = await factory["bybit"]({ ssm, apiCredentialsKeyPrefix });
let bbTeirs = await bb.fetchMarketLeverageTiers(symbol);
console.log(bbTeirs);

let okx = await factory["okx"]({ ssm, apiCredentialsKeyPrefix });
let okxTeirs = await okx.fetchMarketLeverageTiers(symbol);
console.log(okxTeirs);

let gate = await factory["gate"]({ ssm, apiCredentialsKeyPrefix });
let gateTeirs = await gate.fetchLeverageTiers([symbol], { type: 'swap' });
console.log(gateTeirs);

let coinex = await factory["coinex"]({ ssm, apiCredentialsKeyPrefix });
let coinexTeirs = await coinex.fetchLeverageTiers([symbol]);
console.log(coinexTeirs);



process.exit();

// let tradingState: TradeState = await getTradeState(ssm);

// let exchangeCache: { [key: string]: ccxt.pro.Exchange } = {};
// exchangeCache['binance'] = await factory['binance']({ ssm });
// exchangeCache['okx'] = await factory['okx']({ ssm });
// exchangeCache['bybit'] = await factory['bybit']({ ssm });
// exchangeCache['gate'] = await factory['gate']({ ssm });
// exchangeCache['coinex'] = await factory['coinex']({ ssm });

// let settings: {
//     tpSlLimit: number,
//     tpSlTrigger: number,
//     onBoardingHours: number
// } = {
//     tpSlLimit: 0.005,
//     tpSlTrigger: 0.005,
//     onBoardingHours: 2
// };

// while (true) {
//     let currentHour = (new Date()).getUTCHours();

//     let lastTradingHour = (Math.floor(currentHour / 8) * 8);
//     let nextTradingHour = (lastTradingHour + 8) % 24;
//     let nextOnboardingHour = (24 + (nextTradingHour - settings.onBoardingHours)) % 24;

//     if (tradingState.fundingHour != nextTradingHour && tradingState.state != 'closed') {
//         let longExchange = exchangeCache[tradingState.longExchange];
//         let shortExchange = exchangeCache[tradingState.shortExchange];

//         let longPosition = await longExchange.fetchPosition(tradingState.longSymbol);
//         let shortPosition = await shortExchange.fetchPosition(tradingState.shortSymbol);

//         let longRequirement = getPositionSize(longPosition);
//         let shortRequirement = getPositionSize(shortPosition);

//         let longSellSize = await openSellOrdersSize({ exchange: longExchange, symbol: tradingState.longSymbol, position: longPosition });
//         let shortBuySize = await openBuyOrdersSize({ exchange: shortExchange, symbol: tradingState.shortSymbol, position: shortPosition });

//         longRequirement = longRequirement - longSellSize;
//         shortRequirement = shortRequirement - shortBuySize;

//         let longMarket = longExchange.market(tradingState.longSymbol);
//         let shortMarket = shortExchange.market(tradingState.shortSymbol);

//         let {
//             longOrderCount,
//             longSize,
//             shortSize,
//             shortOrderCount,
//             trailingLong,
//             trailingShort
//         } = calculateOrderSizes({
//             idealOrderSize: tradingState.idealOrderSize,
//             longMarket,
//             shortMarket,
//             longRequirement,
//             shortRequirement
//         });

//         await closePositions({
//             longExchange,
//             longOrderCount,
//             longSize,
//             longSymbol: tradingState.longSymbol,
//             shortExchange,
//             shortOrderCount,
//             shortSize,
//             trailingLong,
//             trailingShort,
//             shortSymbol: tradingState.longSymbol,
//             makerSide: tradingState.makerSide
//         });

//         await longExchange.cancelAllOrders(tradingState.longSymbol, { stop: true });
//         await shortExchange.cancelAllOrders(tradingState.shortSymbol, { stop: true });

//         tradingState.state = 'closed';
//         await saveTradeState({ ssm, state: tradingState });
//     }

//     if (tradingState.state == 'closed' && currentHour >= nextOnboardingHour) {
//         //todo: calculate the next trading state

//         tradingState.state = 'open';
//         await saveTradeState({ ssm, state: tradingState });
//     }

//     if (tradingState.state == 'open' && tradingState.fundingHour == nextTradingHour) {
//         let longExchange = exchangeCache[tradingState.longExchange];
//         let shortExchange = exchangeCache[tradingState.shortExchange];

//         let longPosition = await longExchange.fetchPosition(tradingState.longSymbol);
//         let shortPosition = await shortExchange.fetchPosition(tradingState.shortSymbol);

//         await longExchange.cancelAllOrders(tradingState.longSymbol);
//         await shortExchange.cancelAllOrders(tradingState.shortSymbol);

//         let currentLongSize = getPositionSize(longPosition);
//         let currentShortSize = getPositionSize(shortPosition);
//         let positionSize = tradingState.positionSize;

//         let longRequirement = positionSize - currentLongSize;
//         let shortRequirement = positionSize - currentShortSize;

//         let longBuySize = await openBuyOrdersSize({ exchange: longExchange, symbol: tradingState.longSymbol, position: longPosition });
//         let shortSellSize = await openSellOrdersSize({ exchange: shortExchange, symbol: tradingState.shortSymbol, position: shortPosition });

//         longRequirement = longRequirement - longBuySize;
//         shortRequirement = shortRequirement - shortSellSize;

//         let longMarket = longExchange.market(tradingState.longSymbol);
//         let shortMarket = shortExchange.market(tradingState.shortSymbol);

//         let {
//             longOrderCount,
//             longSize,
//             shortSize,
//             shortOrderCount,
//             trailingLong,
//             trailingShort
//         } = calculateOrderSizes({
//             idealOrderSize: tradingState.idealOrderSize,
//             longMarket,
//             shortMarket,
//             longRequirement,
//             shortRequirement
//         });

//         await openPositions({
//             longExchange,
//             longOrderCount,
//             longSize,
//             longSymbol: tradingState.longSymbol,
//             shortExchange,
//             shortOrderCount,
//             shortSize,
//             trailingLong,
//             trailingShort,
//             shortSymbol: tradingState.shortSymbol,
//             makerSide: tradingState.makerSide
//         });

//         longPosition = await longExchange.fetchPosition(tradingState.longSymbol);
//         shortPosition = await shortExchange.fetchPosition(tradingState.shortSymbol);

//         let remainingShortSl = await remainingStopLoss({ exchange: shortExchange, position: shortPosition, symbol: tradingState.shortSymbol });
//         let remainingLongSl = await remainingStopLoss({ exchange: longExchange, position: longPosition, symbol: tradingState.longSymbol });

//         ({
//             longOrderCount,
//             longSize,
//             shortSize,
//             shortOrderCount,
//             trailingLong,
//             trailingShort
//         } = calculateOrderSizes({
//             idealOrderSize: 3,
//             longMarket,
//             shortMarket,
//             longRequirement: remainingLongSl,
//             shortRequirement: remainingShortSl
//         }));

//         await createSlOrders({
//             limit: settings.tpSlLimit,
//             trigger: settings.tpSlTrigger,
//             longExchange,
//             longMarket,
//             longOrderCount,
//             longPosition,
//             longSize,
//             longSymbol: tradingState.longSymbol,
//             shortExchange,
//             shortMarket,
//             shortOrderCount,
//             shortPosition,
//             shortSize,
//             shortSymbol: tradingState.shortSymbol,
//             trailingLong,
//             trailingShort
//         });

//         let remainingShortTp = await remainingTakeProfit({ exchange: shortExchange, position: shortPosition, symbol: tradingState.shortSymbol });
//         let remainingLongTp = await remainingTakeProfit({ exchange: longExchange, position: longPosition, symbol: tradingState.longSymbol });

//         ({
//             longOrderCount,
//             longSize,
//             shortSize,
//             shortOrderCount,
//             trailingLong,
//             trailingShort
//         } = calculateOrderSizes({
//             idealOrderSize: tradingState.idealOrderSize,
//             longMarket,
//             shortMarket,
//             longRequirement: remainingLongTp,
//             shortRequirement: remainingShortTp
//         }));

//         await createTpOrders({
//             limit: settings.tpSlLimit,
//             trigger: settings.tpSlTrigger,
//             longExchange,
//             longMarket,
//             longOrderCount,
//             longPosition,
//             longSize,
//             longSymbol: tradingState.longSymbol,
//             shortExchange,
//             shortMarket,
//             shortOrderCount,
//             shortPosition,
//             shortSize,
//             shortSymbol: tradingState.shortSymbol,
//             trailingLong,
//             trailingShort
//         });

//         tradingState.state = 'filled';
//         await saveTradeState({ ssm, state: tradingState });
//     }

//     await asyncSleep(5000);
// }

//adjust risk limit for each exchange
//change leverage for each exchange
//include risk limit for each token and for each exchange
//multi account and risk limit
//kucoin involved
//spot account and margin
//
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