import { exchangeFactory, getCoinGlassData } from "./lib/global.js";
import { LeverageTier, SymbolType, TradePairReferenceData } from "./lib/types.js";
import { setTimeout as asyncSleep } from 'timers/promises';
import fs from 'fs';
import ccxt, { ExchangePro, Order } from 'ccxt';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const
    apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`,
    tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`,
    coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`,
    region = `${process.env.CCXT_NODE_REGION}`;

let ssm = new AWS.SSM({ region });

let exchangeCache: { [key: string]: ccxt.pro.Exchange } = {};
exchangeCache['binance'] = await exchangeFactory['binance']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['okx'] = await exchangeFactory['okx']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['bybit'] = await exchangeFactory['bybit']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['gate'] = await exchangeFactory['gate']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['coinex'] = await exchangeFactory['coinex']({ ssm, apiCredentialsKeyPrefix });

let refData: TradePairReferenceData = {};

// let coinGlassLink = await getCoinGlassData({ ssm, coinglassSecretKey });
// let fundingRates = await coinGlassLink({}, 0);
let coins = JSON.parse(await fs.promises.readFile('./symbols.json', { encoding: 'utf8' }));;
let bybitTiers: { [key: string]: LeverageTier[] } = {};
let markets = exchangeCache["bybit"].markets;

// for (let i = 0; i < coins.length; i++) {
//     let coin = coins[i];
//     let symbol = `${coin}/USDT:USDT`;
//     if (!(symbol in markets)) continue;
//     let tiers = await exchangeCache['bybit'].fetchMarketLeverageTiers(symbol);
//     bybitTiers[symbol] = tiers;
// }

// await fs.promises.writeFile('./bybit.leverageTiers.json', JSON.stringify(bybitTiers, undefined, 3), { encoding: 'utf8' });


let fees: {
    [key: string]: {
        makerFee: number,
        takerFee: number,
        type: SymbolType
    }
} = {
    "binance": { makerFee: 0.0002, takerFee: 0.0004, type: 'quote' },
    "bybit": { makerFee: 0.0001, takerFee: 0.0006, type: 'quote' },
    "okx": { makerFee: 0.0002, takerFee: 0.0005, type: 'base' },
    "gate": { makerFee: 0.00015, takerFee: 0.0005, type: 'quote' },
    "coinex": { makerFee: 0.0003, takerFee: 0.0005, type: 'base' },
}

async function loadTiers(exName: string): Promise<{ [key: string]: LeverageTier[] }> {
    let content = await fs.promises.readFile(`./${exName}.leverageTiers.json`, { encoding: 'utf8' });
    return JSON.parse(content);
}

let riskLevels: { [key: string]: { [key: string]: LeverageTier[] } } = {};
riskLevels["binance"] = await loadTiers("binance");
riskLevels["bybit"] = await loadTiers("bybit");
riskLevels["coinex"] = await loadTiers("coinex");
riskLevels["gate"] = await loadTiers("gate");
riskLevels["okx"] = await loadTiers("okx");

// let gateRiskLevels = riskLevels["gate"];
// let gateKeys = Object.keys(gateRiskLevels);
// for (let i = 0; i < gateKeys.length; i++) {
//     let coin = gateKeys[i];
//     let gTiers = gateRiskLevels[coin];
//     for (let ii = 0; ii < gTiers.length; ii++) {
//         let gTier = gTiers[ii];
//         gTier.tier = gTier.maxNotional;
//     }
// }
// let content = JSON.stringify(gateRiskLevels, undefined, 3);
// await fs.promises.writeFile('./gate.leverageTiers.json', content, { encoding: 'utf8' });

exchangeCache['binance'].options.defaultType = 'swap';
exchangeCache['gate'].options.defaultType = 'swap';

for (let coinIndex = 0; coinIndex < coins.length; coinIndex++) {
    let coin = coins[coinIndex];
    refData[coin] = {};
    let exchanges = Object.keys(exchangeCache);

    for (let exchangeIndex = 0; exchangeIndex < exchanges.length; exchangeIndex++) {
        let exchangeName = exchanges[exchangeIndex];
        if (!(exchangeName in riskLevels)) continue;

        let expair: any = {};
        let exchange = exchangeCache[exchangeName];
        let pairs = [`${coin}/USDT:USDT`];

        for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
            let pair = pairs[pairIndex];
            if (!(pair in exchangeCache[exchangeName].markets)) continue;
            let levels = riskLevels[exchangeName][pair] || [];
            if (levels.length == 0) {
                try {
                    levels = await exchangeCache[exchangeName].fetchMarketLeverageTiers(`${coin}/USDT:USDT`);
                }
                catch (err) {
                    console.error(err);
                }
                if (levels?.length < 1) {
                    console.log(`${exchangeName} ${coin}`);
                    continue;
                }
            }
            let contractSize: number | undefined = undefined;
            try {
                let market = exchange.market(pair);
                contractSize = market.contractSize;
            }
            catch (err) {
                console.log(`No market for ${exchange.id} ${pair}`);
                console.error(err);
                throw err;
            }
            if (!contractSize) {
                console.log(`Contract Size error ${exchange.id} ${pair}`);
                contractSize = 1;
            }
            expair[pair] = {
                takerFee: fees[exchangeName].takerFee,
                makerFee: fees[exchangeName].makerFee,
                riskLevels: {
                    levels: levels,
                    type: fees[exchangeName].type,
                    contractSize
                },
            };

        }
        if ((Object.keys(expair)).length > 0)
            refData[coin][exchangeName] = expair;
    }
}

let refString = JSON.stringify(refData, undefined, 3);
await fs.promises.writeFile('./reference-data.json', refString, { encoding: 'utf8' });
console.log('done');
//long placement maker and short taker
//short placement maker and long taker
//set leverage
//exchange that requires setting risk limit
//exchange that has the base as the max notion
//interuption placing an open and recovering 
//interuption placing a close and recovering
//interuption placing tp/sl and recovering