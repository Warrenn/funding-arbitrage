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
    createOrder
} from './lib/global.js';

dotenv.config({ override: true });

const
    apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`,
    tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`,
    coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`,
    region = `${process.env.CCXT_NODE_REGION}`,
    refDataFile = `${process.env.REF_DATA_FILE}`,
    settingsPrefix = `${process.env.SETTINGS_KEY_PREFIX}`;

//HACK:get this from the actual funds in trading account
let investmentFundsAvailable: number = 17000;

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
let coinGlassLink = await getCoinGlassData({ ssm, coinglassSecretKey });
fundingsRatePipeline.push(coinGlassLink);
if (apiCredentialsKeyPrefix.match(/\/dev\//)) fundingsRatePipeline.push(sandBoxFundingRateLink);

//HACK:remove dev work here

let centralExchangeKey = settings.centralExchange;
let centralExchage = exchangeCache[centralExchangeKey];
let depositId: string | undefined = undefined;
let depositTxId: string | undefined = undefined;
let amount: number | undefined;
let currency = 'USDT';
let onboardingHour = 6;
let depositAmount = 20;
let retryLimit = 100;

let ignore = ['binance'];
let keys = Object.keys(exchangeCache);

async function findWithdrawal({
    exchange,
    currency,
    address,
    timestamp,
    depositId,
    limit = 10
}: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    address: string,
    timestamp?: number,
    depositId?: string,
    limit?: number
}): Promise<{
    depositId?: string,
    depositTxId?: string
}> {
    let transactions = await exchange.fetchWithdrawals(currency, undefined, limit);
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i];
        if (depositId && transaction.id == depositId) return {
            depositId: transaction.id,
            depositTxId: transaction.txid
        };
        if (timestamp && transaction.timestamp > timestamp && transaction.address == address) return {
            depositId: transaction.id,
            depositTxId: transaction.txid
        };
    }

    return { depositId, depositTxId: undefined };
}

async function findWithdrawalByTime(params: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    address: string,
    timestamp: number
}): Promise<{
    depositId?: string,
    depositTxId?: string
}> {
    return await findWithdrawal(params);
}

async function findWithdrawalById(params: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    address: string,
    depositId: string
}): Promise<{
    depositId?: string,
    depositTxId?: string
}> {
    return await findWithdrawal(params);
}

async function hasDepositArrived({
    exchange,
    currency,
    depositTxId,
    limit = 10
}: {
    exchange: ccxt.pro.Exchange,
    currency: string,
    depositTxId?: string,
    limit?: number
}): Promise<boolean> {
    let transactions = await exchange.fetchDeposits(currency, undefined, limit);
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i];
        if (transaction.txid == depositTxId) return true;
    }

    return false
}


for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    if (ignore.indexOf(key) > -1) continue;

    let exchange = exchangeCache[key];
    let address = settings.deposit[key].address;
    let currency = settings.deposit[key].currency;
    let network = settings.deposit[key].network;
    let exchangeState = tradingState.long;

    //perform the deposit into accounts
    let onboardingTime = new Date();
    onboardingTime.setUTCMilliseconds(0);
    onboardingTime.setUTCSeconds(0);
    onboardingTime.setUTCMinutes(0);
    onboardingTime.setUTCHours(onboardingHour);
    let timestamp = onboardingTime.getTime();

    await withdrawFunds({
        address,
        currency,
        depositAmount,
        network,
        timestamp,
        saveState: async (a) => { },
        depositExchange: exchange,
        withdrawalExchange: centralExchage
    });


    //transfer into tradingAccount
    let balance = await exchange.fetchBalance();
    //if (balance.free[currency] > 0) return;
    let fundingAvailable = await exchange.fetchFundingAmount(currency);
    if (fundingAvailable == 0) throw "funds not available";
    await exchange.transfer(currency, depositAmount, exchange.options.fundingAccount, exchange.options.tradingAccount);

    //closing and transfer to centralAccount

    //transfer into tradingAccount
    balance = await exchange.fetchBalance();
    //if (balance.free[currency] > 0)
    await exchange.transferAllFromTradingToFunding(currency);
    fundingAvailable = await exchange.fetchFundingAmount(currency);
    if (fundingAvailable == 0) throw "funds not available";



}





//if no DepositId
//find depositId and transactionId

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


async function withdrawFunds({
    address,
    currency,
    timestamp,
    network,
    depositAmount,
    depositId,
    depositTxId,
    withdrawalExchange,
    depositExchange,
    saveState,
    retryLimit = 100
}: {
    address: string,
    currency: string,
    timestamp: number,
    network: string,
    depositAmount?: number,
    depositId?: string,
    depositTxId?: string,
    withdrawalExchange: ccxt.pro.Exchange,
    depositExchange: ccxt.pro.Exchange,
    saveState: ({ depositId, depositTxId }: { depositId?: string, depositTxId?: string }) => Promise<void>,
    retryLimit?: number
}) {
    if (!depositId) {
        ({ depositId, depositTxId } = await findWithdrawalByTime({
            address,
            currency,
            exchange: withdrawalExchange,
            timestamp
        }));
    }

    if (!depositTxId && !depositId) {
        let fundingBalace = await withdrawalExchange.fetchBalance({ type: withdrawalExchange.options.fundingAccount });
        let availableInFunding = fundingBalace[currency]?.free || 0;

        let tradingBalance = await withdrawalExchange.fetchBalance({ type: withdrawalExchange.options.tradingAccount });
        let availableInTrading = tradingBalance[currency]?.free || 0;

        if (!depositAmount && availableInTrading) {
            await withdrawalExchange.transfer(currency, availableInTrading, withdrawalExchange.options.tradingAccount, withdrawalExchange.options.fundingAccount);
        }

        if (depositAmount && availableInFunding < depositAmount) {
            let transferAmount = depositAmount - availableInFunding;
            if (availableInTrading < transferAmount) throw `Not enough funds available ${currency} ${depositAmount} in ${withdrawalExchange.id}`;
            await withdrawalExchange.transfer(currency, transferAmount, withdrawalExchange.options.tradingAccount, withdrawalExchange.options.fundingAccount);
        }

        if (!depositAmount) depositAmount = availableInFunding + availableInTrading;

        let transactionResult = await withdrawalExchange.withdraw(currency, depositAmount, address, undefined, { network });
        depositId = transactionResult.id;
        await saveState({ depositId, depositTxId });
    }

    let retryCount = 0;
    while (!depositTxId && depositId) {
        ({ depositId, depositTxId } = await findWithdrawalById({
            address,
            currency,
            exchange: withdrawalExchange,
            depositId
        }));
        if (depositTxId) {
            await saveState({ depositId, depositTxId });
            break;
        }
        retryCount++;
        if (retryCount > retryLimit)
            throw `${currency} withdrawal on ${withdrawalExchange.id} to address ${address} with id ${depositId} could not be found`;
        await asyncSleep(250);
    }

    retryCount = 0;
    while (true) {
        let arrived = await hasDepositArrived({ exchange: depositExchange, currency, depositTxId });
        if (arrived)
            break;
        retryCount++;
        if (retryCount > retryLimit)
            throw `${currency} deposit on ${exchange.id} with TxId ${depositTxId} could not be found`;
        await asyncSleep(250);
    }
}

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

                if (tradePairs.length == 0) continue;

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
                }
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
