import { setTimeout as asyncSleep } from 'timers/promises';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { calculateOrderSizes, closePositions, createSlOrders, createTpOrders, factory, getPositionSize, getTradeState, openBuyOrdersSize, openPositions, openSellOrdersSize, remainingStopLoss, remainingTakeProfit, saveTradeState, calculateBestRoiTradingPairs, processFundingRatesPipeline, getCoinGlassData } from './lib/global.js';
dotenv.config({ override: true });
const apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`, tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`, coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`, region = `${process.env.CCXT_NODE_REGION}`;
let ssm = new AWS.SSM({ region });
let exchangeCache = {};
exchangeCache['binance'] = await factory['binance']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['okx'] = await factory['okx']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['bybit'] = await factory['bybit']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['gate'] = await factory['gate']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['coinex'] = await factory['coinex']({ ssm, apiCredentialsKeyPrefix });
let tradingState = await getTradeState({ ssm, tradeStatusKey });
//need to initialize accounts before opening position
//  for margin call borrow from margin account
//need to finalize accounts aftore closing position
//  for margin call repay all borrowed amounts
//multiple trading selected pairs
//multiple concurrent position opening/closing orders
//recovery by waiting for opening closing orders to conclude
let settings = {
    tpSlLimit: 0.005,
    tpSlTrigger: 0.005,
    onBoardingHours: 2,
    fundingHourlyFreq: 4
};
while (true) {
    let currentHour = (new Date()).getUTCHours();
    let lastTradingHour = (Math.floor(currentHour / settings.fundingHourlyFreq) * settings.fundingHourlyFreq);
    let nextTradingHour = (lastTradingHour + settings.fundingHourlyFreq) % 24;
    let nextOnboardingHour = (24 + (nextTradingHour - settings.onBoardingHours)) % 24;
    if (tradingState.fundingHour != nextTradingHour && tradingState.state != 'closed') {
        let longExchange = exchangeCache[tradingState.longExchange];
        let shortExchange = exchangeCache[tradingState.shortExchange];
        let longPosition = await longExchange.fetchPosition(tradingState.longSymbol);
        let shortPosition = await shortExchange.fetchPosition(tradingState.shortSymbol);
        let longRequirement = getPositionSize(longPosition);
        let shortRequirement = getPositionSize(shortPosition);
        //open position: while the takerPosition Size > makerPosition size
        //while Math.abs(takerSize - makerSize) > orderSize
        //  placeImmediateOrder(makerExchange, orderSize)
        //if all orders are complete
        //check the position size if not desired size
        //place one or more orders of size
        //if orders are driffted close existing orders and place one or more orders of size
        let longSellSize = await openSellOrdersSize({ exchange: longExchange, symbol: tradingState.longSymbol, position: longPosition });
        let shortBuySize = await openBuyOrdersSize({ exchange: shortExchange, symbol: tradingState.shortSymbol, position: shortPosition });
        longRequirement = longRequirement - longSellSize;
        shortRequirement = shortRequirement - shortBuySize;
        let longMarket = longExchange.market(tradingState.longSymbol);
        let shortMarket = shortExchange.market(tradingState.shortSymbol);
        let { longOrderCount, longSize, shortSize, shortOrderCount, trailingLong, trailingShort } = calculateOrderSizes({
            idealOrderSize: tradingState.idealOrderSize,
            longMarket,
            shortMarket,
            longRequirement,
            shortRequirement
        });
        await closePositions({
            longExchange,
            longOrderCount,
            longSize,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortOrderCount,
            shortSize,
            trailingLong,
            trailingShort,
            shortSymbol: tradingState.longSymbol,
            makerSide: tradingState.makerSide
        });
        await longExchange.cancelAllOrders(tradingState.longSymbol, { stop: true });
        await shortExchange.cancelAllOrders(tradingState.shortSymbol, { stop: true });
        tradingState.state = 'closed';
        await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
    }
    if (tradingState.state == 'closed' && currentHour >= nextOnboardingHour) {
        let coinGlassLink = await getCoinGlassData({ ssm, coinglassSecretKey });
        let fundingRates = await processFundingRatesPipeline([coinGlassLink])({ nextFundingHour: nextTradingHour });
        let tradePairs = await calculateBestRoiTradingPairs({
            fundingRates,
            exchangeCache,
            investment: 1000,
            referenceData: {}
        });
        console.log(tradePairs);
        //await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
    }
    if (tradingState.state == 'open' && tradingState.fundingHour == nextTradingHour) {
        let longExchange = exchangeCache[tradingState.longExchange];
        let shortExchange = exchangeCache[tradingState.shortExchange];
        let longPosition = await longExchange.fetchPosition(tradingState.longSymbol);
        let shortPosition = await shortExchange.fetchPosition(tradingState.shortSymbol);
        await longExchange.cancelAllOrders(tradingState.longSymbol);
        await shortExchange.cancelAllOrders(tradingState.shortSymbol);
        let currentLongSize = getPositionSize(longPosition);
        let currentShortSize = getPositionSize(shortPosition);
        let positionSize = tradingState.positionSize;
        let longRequirement = positionSize - currentLongSize;
        let shortRequirement = positionSize - currentShortSize;
        let longBuySize = await openBuyOrdersSize({ exchange: longExchange, symbol: tradingState.longSymbol, position: longPosition });
        let shortSellSize = await openSellOrdersSize({ exchange: shortExchange, symbol: tradingState.shortSymbol, position: shortPosition });
        longRequirement = longRequirement - longBuySize;
        shortRequirement = shortRequirement - shortSellSize;
        let longMarket = longExchange.market(tradingState.longSymbol);
        let shortMarket = shortExchange.market(tradingState.shortSymbol);
        let { longOrderCount, longSize, shortSize, shortOrderCount, trailingLong, trailingShort } = calculateOrderSizes({
            idealOrderSize: tradingState.idealOrderSize,
            longMarket,
            shortMarket,
            longRequirement,
            shortRequirement
        });
        await openPositions({
            longExchange,
            longOrderCount,
            longSize,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortOrderCount,
            shortSize,
            trailingLong,
            trailingShort,
            shortSymbol: tradingState.shortSymbol,
            makerSide: tradingState.makerSide
        });
        longPosition = await longExchange.fetchPosition(tradingState.longSymbol);
        shortPosition = await shortExchange.fetchPosition(tradingState.shortSymbol);
        let remainingShortSl = await remainingStopLoss({ exchange: shortExchange, position: shortPosition, symbol: tradingState.shortSymbol });
        let remainingLongSl = await remainingStopLoss({ exchange: longExchange, position: longPosition, symbol: tradingState.longSymbol });
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
            limit: settings.tpSlLimit,
            trigger: settings.tpSlTrigger,
            longExchange,
            longMarket,
            longOrderCount,
            longPosition,
            longSize,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortMarket,
            shortOrderCount,
            shortPosition,
            shortSize,
            shortSymbol: tradingState.shortSymbol,
            trailingLong,
            trailingShort
        });
        let remainingShortTp = await remainingTakeProfit({ exchange: shortExchange, position: shortPosition, symbol: tradingState.shortSymbol });
        let remainingLongTp = await remainingTakeProfit({ exchange: longExchange, position: longPosition, symbol: tradingState.longSymbol });
        ({
            longOrderCount,
            longSize,
            shortSize,
            shortOrderCount,
            trailingLong,
            trailingShort
        } = calculateOrderSizes({
            idealOrderSize: tradingState.idealOrderSize,
            longMarket,
            shortMarket,
            longRequirement: remainingLongTp,
            shortRequirement: remainingShortTp
        }));
        await createTpOrders({
            limit: settings.tpSlLimit,
            trigger: settings.tpSlTrigger,
            longExchange,
            longMarket,
            longOrderCount,
            longPosition,
            longSize,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortMarket,
            shortOrderCount,
            shortPosition,
            shortSize,
            shortSymbol: tradingState.shortSymbol,
            trailingLong,
            trailingShort
        });
        tradingState.state = 'filled';
        await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
    }
    await asyncSleep(5000);
}
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
//# sourceMappingURL=index.js.map