import { factory, getCoinGlassData } from "./lib/global.js";
import fs from 'fs';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
dotenv.config({ override: true });
const apiCredentialsKeyPrefix = `${process.env.API_CRED_KEY_PREFIX}`, tradeStatusKey = `${process.env.TRADE_STATUS_KEY}`, coinglassSecretKey = `${process.env.COINGLASS_SECRET_KEY}`, region = `${process.env.CCXT_NODE_REGION}`;
let ssm = new AWS.SSM({ region });
let exchangeCache = {};
exchangeCache['binance'] = await factory['binance']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['okx'] = await factory['okx']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['bybit'] = await factory['bybit']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['gate'] = await factory['gate']({ ssm, apiCredentialsKeyPrefix });
exchangeCache['coinex'] = await factory['coinex']({ ssm, apiCredentialsKeyPrefix });
let refData = {};
let coinGlassLink = await getCoinGlassData({ ssm, coinglassSecretKey });
let fundingRates = await coinGlassLink({}, 0);
let coins = Object.keys(fundingRates);
// let bybitTiers: { [key: string]: LeverageTier[] } = {};
// let markets = exchangeCache["bybit"].markets;
// for (let i = 0; i < coins.length; i++) {
//     let coin = coins[i];
//     let symbol = `${coin}/USDT:USDT`;
//     if (!(symbol in markets)) continue;
//     let tiers = await exchangeCache['bybit'].fetchMarketLeverageTiers(symbol);
//     bybitTiers[symbol] = tiers;
// }
// await fs.promises.writeFile('./bybit2.leverageTiers.json', JSON.stringify(bybitTiers, undefined, 3), { encoding: 'utf8' });
let fees = {
    "binance": { makerFee: 0.0002, takerFee: 0.0004, type: 'quote' },
    "bybit": { makerFee: 0.0001, takerFee: 0.0006, type: 'quote' },
    "okx": { makerFee: 0.0002, takerFee: 0.0005, type: 'base' },
    "gate": { makerFee: 0.00015, takerFee: 0.0005, type: 'quote' },
    "coinex": { makerFee: 0.0003, takerFee: 0.0005, type: 'base' },
};
async function loadTiers(exName) {
    let content = await fs.promises.readFile(`./${exName}.leverageTiers.json`, { encoding: 'utf8' });
    return JSON.parse(content);
}
let riskLevels = {};
riskLevels["binance"] = await loadTiers("binance");
riskLevels["bybit"] = await loadTiers("bybit");
riskLevels["coinex"] = await loadTiers("coinex");
riskLevels["gate"] = await loadTiers("gate");
riskLevels["okx"] = await loadTiers("okx");
for (let coinIndex = 0; coinIndex < coins.length; coinIndex++) {
    let coin = coins[coinIndex];
    refData[coin] = {};
    let exchanges = Object.keys(fundingRates[coin]);
    for (let exchangeIndex = 0; exchangeIndex < exchanges.length; exchangeIndex++) {
        let exchangeName = exchanges[exchangeIndex];
        if (!(exchangeName in riskLevels))
            continue;
        refData[coin][exchangeName] = {};
        let exchange = exchangeCache[exchangeName];
        let pairs = Object.keys(fundingRates[coin][exchangeName]);
        for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
            try {
                let pair = pairs[pairIndex];
                console.log(exchangeName + ':' + pair);
                let levels = riskLevels[exchangeName][pair];
                let market = exchange.market(pair);
                refData[coin][exchangeName][pair] = {
                    takerFee: fees[exchangeName].takerFee,
                    makerFee: fees[exchangeName].makerFee,
                    riskLevels: {
                        levels: levels,
                        type: fees[exchangeName].type,
                        contractSize: market.contractSize
                    },
                };
            }
            catch (err) {
                console.error(err);
            }
        }
    }
}
let refString = JSON.stringify(refData, undefined, 3);
await fs.promises.writeFile('./refData.json', refString, { encoding: 'utf8' });
//# sourceMappingURL=generateRefData.js.map