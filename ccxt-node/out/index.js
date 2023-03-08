import { setTimeout as asyncSleep } from 'timers/promises';
import fs from 'fs';
import path from 'path';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { closePositions, createSlOrders, createTpOrders, exchangeFactory, getTradeState, openPositions, saveTradeState, calculateBestRoiTradingPairs, processFundingRatesPipeline, getCoinGlassData, sandBoxFundingRateLink, getSettings } from './lib/global.js';
dotenv.config({ override: true });
const apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`, tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`, coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`, region = `${process.env.CCXT_NODE_REGION}`, refDataFile = `${process.env.REF_DATA_FILE}`, settingsPrefix = `${process.env.SETTINGS_KEY_PREFIX}`;
//HACK:get this from the actual funds in trading account
let investmentFundsAvailable = 17000;
let ssm = new AWS.SSM({ region });
let exchangeCache = {};
exchangeCache['binance'] = await exchangeFactory['binance']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['okx'] = await exchangeFactory['okx']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['bybit'] = await exchangeFactory['bybit']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['gate'] = await exchangeFactory['gate']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['coinex'] = await exchangeFactory['coinex']({ ssm, apiCredentialsKeyPrefix });
let referenceData = JSON.parse(await fs.promises.readFile(path.resolve(refDataFile), { encoding: 'utf8' }));
let settings = await getSettings({ ssm, settingsPrefix });
let tradingState = await getTradeState({ ssm, tradeStatusKey });
// settings.centralExchange = 'binance';
// settings.idealBatchSize = 5;
// settings.deposit = {
//     'binance': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0x762252882dd8873cf4afa4dbeee07b9d3fd06dcb'
//     },
//     'bybit': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0xb0cbf4dcc7e836fc94380e0900f89e2472d3cc34'
//     },
//     'okx': {
//         currency: 'USDT',
//         network: 'MATIC',
//         address: '0x573a984998a3c7dcf1929b55d74400b3e308612a'
//     },
//     'gate': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0xC08F5d4B9F8B0371c45141E10d37556186fE1736'
//     },
//     'coinex': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0x520291749173427d4851f5384b263bc8b210e25c'
//     }
// }
// settings.withdraw = {
//     'binance': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0x762252882dd8873cf4afa4dbeee07b9d3fd06dcb'
//     },
//     'bybit': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0x762252882dd8873cf4afa4dbeee07b9d3fd06dcb'
//     },
//     'okx': {
//         currency: 'USDT',
//         network: 'AVALANCHE',
//         address: '0x762252882dd8873cf4afa4dbeee07b9d3fd06dcb'
//     },
//     'gate': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0x762252882dd8873cf4afa4dbeee07b9d3fd06dcb'
//     },
//     'coinex': {
//         currency: 'USDT',
//         network: 'BEP20',
//         address: '0x762252882dd8873cf4afa4dbeee07b9d3fd06dcb'
//     }
// }
// console.log(JSON.stringify(settings, undefined, 3));
let fundingsRatePipeline = [];
let coinGlassLink = await getCoinGlassData({ ssm, coinglassSecretKey });
fundingsRatePipeline.push(coinGlassLink);
if (apiCredentialsKeyPrefix.match(/\/dev\//))
    fundingsRatePipeline.push(sandBoxFundingRateLink);
//HACK:remove dev work here
tradingState.state = 'filled';
//check if funds in futures account
// if not check if funds in landing account
//  if there tranfer to futures account and continue
//  if not there
//check on the destination exchange
// look for deposits that have the expected memo
// if arrived continue if not
//  check on the holding exchange
//    look for withdrawls that have the expected memo
//    if not make the withdrawal with the expected memo
//    keep waiting until deposit with memo arrived on destination exchange
//    once arrived tranfer to futures account
//if no id provided
//check for deposits made to destination if after onboardinghour use that transactionId
let exchange = exchangeCache['bybit'];
//privateGetAssetV3PrivateTransferInterTransferListQuery
//'asset/v3/private/transfer/inter-transfer/list/query'
//const response = await this.privateGetAssetV3PrivateTransferInterTransferListQuery (this.extend (request, params));
//asset/v3/private/transfer/account-coin/balance/query
//okx:
//let response = await exchange.fetchBalance({ instType: 'funding' });
//bybit:
//let response = await exchange.privateGetAssetV3PrivateTransferAccountCoinBalanceQuery({ accountType: "FUND", coin: "USDT" });
//if id and no txId
//keep looking for 
async function main() {
    while (true) {
        try {
            let currentHour = (new Date()).getUTCHours();
            let lastTradingHour = (Math.floor(currentHour / settings.fundingHourlyFreq) * settings.fundingHourlyFreq);
            let nextTradingHour = (lastTradingHour + settings.fundingHourlyFreq) % 24;
            let nextOnboardingHour = (24 + (nextTradingHour - settings.onBoardingHours)) % 24;
            //HACK:remove dev work here
            currentHour = nextOnboardingHour;
            tradingState.fundingHour = lastTradingHour;
            tradingState.leverage = 3;
            tradingState.long = {
                exchange: "gate",
                maxLeverage: 5,
                riskIndex: 3000000,
                symbol: 'APE/USDT:USDT'
            };
            tradingState.short = {
                exchange: "coinex",
                maxLeverage: 5,
                riskIndex: 5,
                symbol: 'APE/USDT:USDT'
            };
            tradingState.targetSize = 10;
            tradingState.makerSide = 'long';
            settings.idealBatchSize = 5;
            settings.trailPct = 0.005;
            settings.idealOrderValue = 5;
            if (tradingState.fundingHour != nextTradingHour && tradingState.state != 'closed') {
                let longExchange = exchangeCache[tradingState.long.exchange];
                let shortExchange = exchangeCache[tradingState.short.exchange];
                await closePositions({
                    longExchange,
                    longSymbol: tradingState.long.symbol,
                    shortExchange,
                    shortSymbol: tradingState.short.symbol,
                    makerSide: tradingState.makerSide,
                    idealOrderValue: settings.idealOrderValue,
                    idealBatchSize: settings.idealBatchSize,
                    trailPct: settings.trailPct
                });
                await longExchange.cancelAllOrders(tradingState.long.symbol);
                await shortExchange.cancelAllOrders(tradingState.short.symbol);
                await longExchange.cancelAllOrders(tradingState.long.symbol, { stop: true });
                await shortExchange.cancelAllOrders(tradingState.short.symbol, { stop: true });
                //todo:withdraw money
                tradingState.state = 'closed';
                await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
            }
            if (tradingState.state == 'closed' && currentHour >= nextOnboardingHour) {
                //todo:get investmentFundsAvailable from the balance of the common trading account
                let investmentAmount = investmentFundsAvailable * settings.investmentMargin;
                let investment = investmentAmount * settings.initialMargin;
                let fundingRates = await processFundingRatesPipeline(fundingsRatePipeline)({ nextFundingHour: nextTradingHour });
                let tradePairs = await calculateBestRoiTradingPairs({
                    fundingRates,
                    exchangeCache,
                    investment,
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
                let longPrecision = longMarket.precision.amount || 1;
                let shortPrecision = shortMarket.precision.amount || 1;
                let orderSize = investment / (longRate + shortRate);
                orderSize = Math.floor(orderSize / longPrecision) * longPrecision;
                orderSize = Math.floor(orderSize / shortPrecision) * shortPrecision;
                tradingState.fundingHour = nextTradingHour;
                tradingState.long = {
                    exchange: bestPair.longExchange,
                    symbol: bestPair.longSymbol,
                    maxLeverage: bestPair.longMaxLeverage,
                    riskIndex: bestPair.longRiskIndex
                };
                tradingState.short = {
                    exchange: bestPair.shortExchange,
                    symbol: bestPair.shortSymbol,
                    maxLeverage: bestPair.shortMaxLeverage,
                    riskIndex: bestPair.shortRiskIndex
                };
                tradingState.makerSide = bestPair.makerSide;
                tradingState.targetSize = orderSize;
                tradingState.state = 'open';
                tradingState.leverage = bestPair.leverage;
                await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
            }
            if (tradingState.state == 'open' && tradingState.fundingHour == nextTradingHour) {
                let longExchange = exchangeCache[tradingState.long.exchange];
                let shortExchange = exchangeCache[tradingState.short.exchange];
                //todo:deposit amount
                //first check if there is a deposit en route
                //if there is wait for it to arrive
                //if not make a deposit
                let exchange = longExchange;
                let symbol = tradingState.long.symbol;
                // let rate = (await exchange.fetchOHLCV(symbol, undefined, undefined, 1))[0][4];
                // let requiredLiquidity = (tradingState.targetSize * rate * tradingState.leverage) / settings.initialMargin;
                //place deposit information
                await longExchange.setRiskLimit(tradingState.long.riskIndex, tradingState.long.symbol);
                await longExchange.setLeverage(tradingState.long.maxLeverage, tradingState.long.symbol);
                await shortExchange.setRiskLimit(tradingState.short.riskIndex, tradingState.short.symbol);
                await shortExchange.setLeverage(tradingState.short.maxLeverage, tradingState.short.symbol);
                await openPositions({
                    longExchange,
                    longSymbol: tradingState.long.symbol,
                    shortExchange,
                    shortSymbol: tradingState.short.symbol,
                    makerSide: tradingState.makerSide,
                    targetSize: tradingState.targetSize,
                    trailPct: settings.trailPct,
                    idealOrderValue: settings.idealOrderValue,
                    idealBatchSize: settings.idealBatchSize
                });
                await createSlOrders({
                    limit: settings.tpSlLimit,
                    trigger: settings.tpSlTrigger,
                    longExchange,
                    longSymbol: tradingState.long.symbol,
                    shortExchange,
                    shortSymbol: tradingState.short.symbol
                });
                await createTpOrders({
                    limit: settings.tpSlLimit,
                    trigger: settings.tpSlTrigger,
                    longExchange,
                    longSymbol: tradingState.long.symbol,
                    shortExchange,
                    shortSymbol: tradingState.short.symbol
                });
                tradingState.state = 'filled';
                await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
            }
            await asyncSleep(5000);
        }
        catch (err) {
            console.error(err);
        }
    }
}
//# sourceMappingURL=index.js.map