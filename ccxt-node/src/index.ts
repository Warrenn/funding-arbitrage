import { setTimeout as asyncSleep } from 'timers/promises';
import fs from 'fs';
import path from 'path';
import ccxt from 'ccxt';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';

import {
    FundingRatesChainFunction,
    SetRiskLimitFunction,
    Settings,
    TradePairReferenceData,
    TradeState
} from './lib/types.js';

import {
    closePositions,
    createSlOrders,
    createTpOrders,
    exchangeFactory,
    getTradeState,
    openPositions,
    saveTradeState,
    calculateBestRoiTradingPairs,
    processFundingRatesPipeline,
    getCoinGlassData,
    sandBoxFundingRateLink,
    getSettings,
    withdrawFunds
} from './lib/global.js';

dotenv.config({ override: true });

const
    apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`,
    tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`,
    coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`,
    region = `${process.env.CCXT_NODE_REGION}`,
    refDataFile = `${process.env.REF_DATA_FILE}`,
    settingsPrefix = `${process.env.SETTINGS_KEY_PREFIX}`;

let ssm = new AWS.SSM({ region });

let exchangeCache: { [key: string]: ccxt.pro.Exchange } = {};
exchangeCache['binance'] = await exchangeFactory['binance']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['okx'] = await exchangeFactory['okx']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['bybit'] = await exchangeFactory['bybit']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['gate'] = await exchangeFactory['gate']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['coinex'] = await exchangeFactory['coinex']({ ssm, apiCredentialsKeyPrefix });

let referenceData: TradePairReferenceData = JSON.parse(await fs.promises.readFile(path.resolve(refDataFile), { encoding: 'utf8' }));
let settings: Settings = await getSettings({ ssm, settingsPrefix });
let tradingState: TradeState = await getTradeState({ ssm, tradeStatusKey });

let fundingsRatePipeline: FundingRatesChainFunction[] = [];
let coinGlassLink = await getCoinGlassData({ ssm, coinglassSecretKey, fundingThreshold: 0.06 });
fundingsRatePipeline.push(coinGlassLink);
if (apiCredentialsKeyPrefix.match(/\/dev\//)) fundingsRatePipeline.push(sandBoxFundingRateLink);

let centralExchangeKey = settings.centralExchange;
let centralExchage = exchangeCache[centralExchangeKey];

await main();

async function main() {
    while (true) {
        try {
            let logMessage = '';
            let currentHour = (new Date()).getUTCHours();

            let onboardingTime = new Date();
            onboardingTime.setUTCMilliseconds(0);
            onboardingTime.setUTCSeconds(0);
            onboardingTime.setUTCMinutes(0);
            onboardingTime.setUTCHours(currentHour);
            let timestamp = onboardingTime.getTime();

            let lastTradingHour = (Math.floor(currentHour / settings.fundingHourlyFreq) * settings.fundingHourlyFreq);
            let nextTradingHour = (lastTradingHour + settings.fundingHourlyFreq) % 24;
            let nextOnboardingHour = (24 + (nextTradingHour - settings.onBoardingHours)) % 24;

            //close positions then withdraw funds from trading exchanges and deposit into the central exchange
            if (tradingState.fundingHour != nextTradingHour && tradingState.state != 'closed') {
                let longExchange = exchangeCache[tradingState.long.exchange];
                let shortExchange = exchangeCache[tradingState.short.exchange];
                console.log(`closing positions for long:${longExchange.id}(${tradingState.long.symbol}) short:${shortExchange.id}(${tradingState.short.symbol})`)

                await closePositions({
                    longExchange,
                    longSymbol: tradingState.long.symbol,
                    shortExchange,
                    shortSymbol: tradingState.short.symbol,
                    makerSide: tradingState.makerSide,
                    idealOrderValue: settings.idealOrderValue,
                    idealBatchSize: settings.idealBatchSize
                });

                console.log('canceling open orders')
                await longExchange.cancelAllOrders(tradingState.long.symbol);
                await shortExchange.cancelAllOrders(tradingState.short.symbol);

                await longExchange.cancelAllOrders(tradingState.long.symbol, { stop: true });
                await shortExchange.cancelAllOrders(tradingState.short.symbol, { stop: true });

                let longDetails = settings.withdraw[tradingState.long.exchange];
                let shortDetails = settings.withdraw[tradingState.short.exchange];

                await Promise.all([
                    withdrawFunds({
                        address: longDetails.address,
                        currency: longDetails.currency,
                        network: longDetails.network,
                        timestamp,
                        saveState: async ({ depositId, depositTxId }) => {
                            console.log(`withdraw saving state for long id:${depositId} and txId:${depositTxId}`)
                            tradingState.long.withdrawId = depositId;
                            tradingState.long.withdrawTxId = depositTxId;
                            await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
                        },
                        depositExchange: centralExchage,
                        withdrawalExchange: longExchange,
                        depositId: tradingState.long.withdrawId,
                        depositTxId: tradingState.long.withdrawTxId
                    }),
                    withdrawFunds({
                        address: shortDetails.address,
                        currency: shortDetails.currency,
                        network: shortDetails.network,
                        timestamp,
                        saveState: async ({ depositId, depositTxId }) => {
                            console.log(`withdraw saving state for short id:${depositId} and txId:${depositTxId}`)
                            tradingState.short.withdrawId = depositId;
                            tradingState.short.withdrawTxId = depositTxId;
                            await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
                        },
                        depositExchange: centralExchage,
                        withdrawalExchange: shortExchange,
                        depositId: tradingState.short.withdrawId,
                        depositTxId: tradingState.short.withdrawTxId
                    })]);

                tradingState.state = 'closed';
                await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
            }

            //calculate the best trading pairs and settings for the next trade run
            if (tradingState.state == 'closed' && currentHour >= nextOnboardingHour) {
                if (!logMessage) logMessage = `calculating next trade for ${nextTradingHour}`
                if (logMessage) console.log(logMessage);

                let centralCurrency = settings.withdraw[centralExchangeKey].currency;
                let centralBalance = await centralExchage.fetchBalance({ type: centralExchage.options.fundingAccount });
                let investmentFundsAvailable = (centralBalance[centralCurrency]?.free || 0);

                let investmentAmount = investmentFundsAvailable * settings.investmentMargin;
                let investment = investmentAmount * settings.initialMargin;

                let fundingRates = await processFundingRatesPipeline(fundingsRatePipeline)({ nextFundingHour: nextTradingHour });
                let tradePairs = await calculateBestRoiTradingPairs({
                    fundingRates,
                    exchangeCache,
                    investment,
                    referenceData,
                    minThreshold: settings.minThreshold
                });

                if (tradePairs.length == 0) {
                    continue;
                }

                let bestPair = tradePairs[0];
                logMessage = '';
                console.log(`calculation found for ${nextTradingHour} ${JSON.stringify(bestPair)}`)

                let longExchange = exchangeCache[bestPair.longExchange];
                let shortExchange = exchangeCache[bestPair.shortExchange];

                let longRate = (await longExchange.fetchOrderBook(bestPair.longSymbol, longExchange.options.fetchOrderBookLimit)).bids[0][0];
                let shortRate = (await shortExchange.fetchOrderBook(bestPair.shortSymbol, shortExchange.options.fetchOrderBookLimit)).asks[0][0];

                let longMarket = longExchange.market(bestPair.longSymbol);
                let shortMarket = shortExchange.market(bestPair.shortSymbol);

                let longPrecision = longMarket.precision.amount || 1;
                let shortPrecision = shortMarket.precision.amount || 1;

                let orderSize = (investment / (longRate + shortRate)) * bestPair.leverage;

                if (longPrecision <= 1 && longPrecision > 0) orderSize = Math.floor(orderSize / longPrecision) * longPrecision;
                if (shortPrecision <= 1 && shortPrecision > 0) orderSize = Math.floor(orderSize / shortPrecision) * shortPrecision;
                if (longPrecision >= 1) orderSize = Math.floor(orderSize * longPrecision) / longPrecision;
                if (shortPrecision >= 1) orderSize = Math.floor(orderSize * shortPrecision) / shortPrecision;

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
                }
                tradingState.makerSide = bestPair.makerSide;
                tradingState.targetSize = orderSize;
                tradingState.state = 'open';
                tradingState.leverage = bestPair.leverage;

                await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
            }

            //widthdraw from the central exchange and deposit into all the trading exchanges then open positions 
            if (tradingState.state == 'open' && tradingState.fundingHour == nextTradingHour) {
                let longExchange = exchangeCache[tradingState.long.exchange];
                let shortExchange = exchangeCache[tradingState.short.exchange];

                let longDetails = settings.deposit[tradingState.long.exchange];
                let shortDetails = settings.deposit[tradingState.short.exchange];

                let longRate = (await longExchange.fetchOrderBook(tradingState.long.symbol, longExchange.options.fetchOrderBookLimit)).bids[0][0];
                let shortRate = (await shortExchange.fetchOrderBook(tradingState.short.symbol, shortExchange.options.fetchOrderBookLimit)).asks[0][0];

                let longDepositAmount = (tradingState.targetSize * longRate) / (tradingState.leverage * settings.initialMargin);
                let shortDepositAmount = (tradingState.targetSize * shortRate) / (tradingState.leverage * settings.initialMargin);
                console.log(`withdrawing funds and opening positions ${tradingState.targetSize} long:${longExchange.id}(${tradingState.long.symbol}) $${longDepositAmount} short:${shortExchange.id}(${tradingState.short.symbol}) $${shortDepositAmount}`);

                await Promise.all([
                    withdrawFunds({
                        address: longDetails.address,
                        currency: longDetails.currency,
                        network: longDetails.network,
                        timestamp,
                        saveState: async ({ depositId, depositTxId }) => {
                            console.log(`deposit saving state for long id:${depositId} and txId:${depositTxId}`)
                            tradingState.long.depositId = depositId;
                            tradingState.long.depositTxId = depositTxId;
                            await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
                        },
                        depositExchange: longExchange,
                        withdrawalExchange: centralExchage,
                        depositId: tradingState.long.depositId,
                        depositTxId: tradingState.long.depositTxId,
                        depositAmount: longDepositAmount
                    }),
                    withdrawFunds({
                        address: shortDetails.address,
                        currency: shortDetails.currency,
                        network: shortDetails.network,
                        timestamp,
                        saveState: async ({ depositId, depositTxId }) => {
                            console.log(`deposit saving state for short id:${depositId} and txId:${depositTxId}`)
                            tradingState.short.depositId = depositId;
                            tradingState.short.depositTxId = depositTxId;
                            await saveTradeState({ ssm, state: tradingState, tradeStatusKey });
                        },
                        depositExchange: shortExchange,
                        withdrawalExchange: centralExchage,
                        depositId: tradingState.short.depositId,
                        depositTxId: tradingState.short.depositTxId,
                        depositAmount: shortDepositAmount
                    })]);

                let longBalace = await longExchange.fetchBalance({ type: longExchange.options.fundingAccount });
                let longFunding = Math.floor(((longBalace[longDetails.currency]?.free || 0) - (longExchange.options.leaveBehind || 1)) * 100) / 100;
                if (longFunding > 0) {
                    console.log(`transfering balance ${longFunding} for ${longExchange.id} from ${longExchange.options.fundingAccount} to ${longExchange.options.tradingAccount}`)
                    await longExchange.transfer(longDetails.currency, longFunding, longExchange.options.fundingAccount, longExchange.options.tradingAccount);
                }

                let shortBalace = await shortExchange.fetchBalance({ type: shortExchange.options.fundingAccount });
                let shortFunding = Math.floor(((shortBalace[shortDetails.currency]?.free || 0) - (shortExchange.options.leaveBehind || 1)) * 100) / 100;
                if (shortFunding > 0) {
                    console.log(`transfering balance ${shortFunding} for ${shortExchange.id} from ${shortExchange.options.fundingAccount} to ${shortExchange.options.tradingAccount}`)
                    await shortExchange.transfer(shortDetails.currency, shortFunding, shortExchange.options.fundingAccount, shortExchange.options.tradingAccount);
                }

                await (<SetRiskLimitFunction>longExchange.setRiskLimit)(tradingState.long.riskIndex, tradingState.long.symbol);
                await longExchange.setLeverage(tradingState.long.maxLeverage, tradingState.long.symbol);

                await (<SetRiskLimitFunction>shortExchange.setRiskLimit)(tradingState.short.riskIndex, tradingState.short.symbol);
                await shortExchange.setLeverage(tradingState.short.maxLeverage, tradingState.short.symbol);

                await openPositions({
                    longExchange,
                    longSymbol: tradingState.long.symbol,
                    shortExchange,
                    shortSymbol: tradingState.short.symbol,
                    makerSide: tradingState.makerSide,
                    targetSize: tradingState.targetSize,
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
