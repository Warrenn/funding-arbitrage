import { setTimeout as asyncSleep } from 'timers/promises';
import fs from 'fs';
import path from 'path';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { closePositions, createSlOrders, createTpOrders, exchangeFactory, getTradeState, openPositions, saveTradeState, calculateBestRoiTradingPairs, processFundingRatesPipeline, getCoinGlassData, sandBoxFundingRateLink, getSettings } from './lib/global.js';
dotenv.config({ override: true });
const apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`, tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`, coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`, region = `${process.env.CCXT_NODE_REGION}`, refDataFile = `${process.env.REF_DATA_FILE}`, idealTradeSizesFile = `${process.env.IDEAL_TRADE_SIZES_FILE}`, settingsPrefix = `${process.env.SETTINGS_KEY_PREFIX}`;
let investmentFundsAvailable = 1000;
let ssm = new AWS.SSM({ region });
let exchangeCache = {};
exchangeCache['binance'] = await exchangeFactory['binance']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['okx'] = await exchangeFactory['okx']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['bybit'] = await exchangeFactory['bybit']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['gate'] = await exchangeFactory['gate']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['coinex'] = await exchangeFactory['coinex']({ ssm, apiCredentialsKeyPrefix });
let referenceData = JSON.parse(await fs.promises.readFile(path.resolve(refDataFile), { encoding: 'utf8' }));
let idealTradeSizes = JSON.parse(await fs.promises.readFile(path.resolve(idealTradeSizesFile), { encoding: 'utf8' }));
let settings = await getSettings({ ssm, settingsPrefix });
let tradingState = await getTradeState({ ssm, tradeStatusKey });
let fundingsRatePipeline = [];
let coinGlassLink = await getCoinGlassData({ ssm, coinglassSecretKey });
fundingsRatePipeline.push(coinGlassLink);
if (apiCredentialsKeyPrefix.match(/\/dev\//))
    fundingsRatePipeline.push(sandBoxFundingRateLink);
while (true) {
    let currentHour = (new Date()).getUTCHours();
    let lastTradingHour = (Math.floor(currentHour / settings.fundingHourlyFreq) * settings.fundingHourlyFreq);
    let nextTradingHour = (lastTradingHour + settings.fundingHourlyFreq) % 24;
    let nextOnboardingHour = (24 + (nextTradingHour - settings.onBoardingHours)) % 24;
    //HACK:remove dev work here
    currentHour = nextOnboardingHour;
    tradingState.fundingHour = nextTradingHour;
    tradingState.longMaxLeverage = 100;
    tradingState.shortMaxLeverage = 100;
    tradingState.orderSize = 1.2;
    tradingState.longExchange = "bybit";
    tradingState.shortExchange = "okx";
    tradingState.makerSide = 'short';
    //short as maker
    //long as maker
    //binance as short
    //binance as long
    //...
    if (tradingState.fundingHour != nextTradingHour && tradingState.state != 'closed') {
        let longExchange = exchangeCache[tradingState.longExchange];
        let shortExchange = exchangeCache[tradingState.shortExchange];
        await closePositions({
            longExchange,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortSymbol: tradingState.shortSymbol,
            makerSide: tradingState.makerSide,
            idealTradeSizes
        });
        await longExchange.cancelAllOrders(tradingState.longSymbol);
        await shortExchange.cancelAllOrders(tradingState.shortSymbol);
        await longExchange.cancelAllOrders(tradingState.longSymbol, { stop: true });
        await shortExchange.cancelAllOrders(tradingState.shortSymbol, { stop: true });
        //todo:withdraw money
        tradingState.state = 'closed';
        await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
    }
    if (tradingState.state == 'closed' && currentHour >= nextOnboardingHour) {
        //todo:get investmentFundsAvailable from the balance of the common trading account
        let investmentAmount = investmentFundsAvailable * settings.investmentMargin;
        let fundingRates = await processFundingRatesPipeline(fundingsRatePipeline)({ nextFundingHour: nextTradingHour });
        let tradePairs = await calculateBestRoiTradingPairs({
            fundingRates,
            exchangeCache,
            investment: investmentAmount,
            referenceData
        });
        if (tradePairs.length == 0)
            continue;
        let bestPair = tradePairs[0];
        let longExchange = exchangeCache[bestPair.longExchange];
        let shortExchange = exchangeCache[bestPair.shortExchange];
        let longRate = (await longExchange.fetchOHLCV(bestPair.longSymbol, undefined, undefined, 1))[0][4];
        let shortRate = (await shortExchange.fetchOHLCV(bestPair.shortSymbol, undefined, undefined, 1))[0][4];
        let longMarket = longExchange.market(bestPair.longSymbol);
        let shortMarket = shortExchange.market(bestPair.shortSymbol);
        let longContractSize = longMarket.contractSize || 1;
        let shortContractSize = shortMarket.contractSize || 1;
        let orderSize = ((investmentAmount * settings.initialMargin) / 2) / ((longRate + shortRate) / 2);
        orderSize = Math.floor(orderSize / longContractSize) * longContractSize;
        orderSize = Math.floor(orderSize / shortContractSize) * shortContractSize;
        tradingState.fundingHour = nextTradingHour;
        tradingState.longExchange = bestPair.longExchange;
        tradingState.longSymbol = bestPair.longSymbol;
        tradingState.makerSide = bestPair.makerSide;
        tradingState.orderSize = orderSize;
        tradingState.shortExchange = bestPair.shortExchange;
        tradingState.shortSymbol = bestPair.shortSymbol;
        tradingState.state = 'open';
        tradingState.leverage = bestPair.leverage;
        tradingState.longMaxLeverage = bestPair.longMaxLeverage;
        tradingState.longRiskIndex = bestPair.longRiskIndex;
        tradingState.shortMaxLeverage = bestPair.shortMaxLeverage;
        tradingState.shortRiskIndex = bestPair.shortRiskIndex;
        await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
    }
    if (tradingState.state == 'open' && tradingState.fundingHour == nextTradingHour) {
        let longExchange = exchangeCache[tradingState.longExchange];
        let shortExchange = exchangeCache[tradingState.shortExchange];
        //todo:deposit amount
        //first check if there is a deposit en route
        //if there is wait for it to arrive
        //if not make a deposit
        let exchange = longExchange;
        let symbol = tradingState.longSymbol;
        let rate = (await exchange.fetchOHLCV(symbol, undefined, undefined, 1))[0][4];
        let requiredLiquidity = (tradingState.orderSize * rate) / settings.initialMargin;
        //place deposit information
        await longExchange.setRiskLimit(tradingState.longRiskIndex, tradingState.longSymbol);
        await longExchange.setLeverage(tradingState.longMaxLeverage, tradingState.longSymbol);
        await shortExchange.setRiskLimit(tradingState.shortRiskIndex, tradingState.shortSymbol);
        await shortExchange.setLeverage(tradingState.shortMaxLeverage, tradingState.shortSymbol);
        await openPositions({
            longExchange,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortSymbol: tradingState.shortSymbol,
            makerSide: tradingState.makerSide,
            orderSize: tradingState.orderSize,
            trailPct: settings.trailPct,
            idealTradeSizes
        });
        await createSlOrders({
            limit: settings.tpSlLimit,
            trigger: settings.tpSlTrigger,
            longExchange,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortSymbol: tradingState.shortSymbol,
            idealTradeSizes
        });
        await createTpOrders({
            limit: settings.tpSlLimit,
            trigger: settings.tpSlTrigger,
            longExchange,
            longSymbol: tradingState.longSymbol,
            shortExchange,
            shortSymbol: tradingState.shortSymbol,
            idealTradeSizes
        });
        tradingState.state = 'filled';
        await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
    }
    await asyncSleep(5000);
}
//# sourceMappingURL=index.js.map