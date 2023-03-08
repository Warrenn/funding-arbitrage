import ccxt, { ExchangePro, Order } from 'ccxt'

export type MakerSide = 'long' | 'short'

export type SymbolType = 'quote' | 'base'

export type SetRiskLimitFunction = (riskIndex: number, symbol: string) => Promise<any>

export type GetPriceFunction = ({ side, bid, ask }: { side: Order["side"], bid: number, ask: number }) => number

export type ExchangeFactory = ({ ssm, apiCredentialsKeyPrefix }: { ssm: AWS.SSM, apiCredentialsKeyPrefix: string }) => Promise<ccxt.ExchangePro>

export type FetchOpenStopOrdersFunction = (symbol: string, since?: number, limit?: number, params?: ccxt.Params) => Promise<ccxt.Order[]>

export type FundingRatesChainFunction = (fundingRates: FundingRates, nextFundingHour: number) => Promise<FundingRates>

export type TransferDetails = {
    [exchange: string]: {
        currency: string,
        address: string,
        network: string
    }
}

export type Settings = {
    trailPct: number,
    investmentMargin: number,
    initialMargin: number,
    tpSlLimit: number,
    tpSlTrigger: number,
    onBoardingHours: number,
    fundingHourlyFreq: number,
    idealOrderValue: number,
    idealBatchSize?: number,
    deposit: TransferDetails,
    withdraw: TransferDetails,
    centralExchange: string
}

export type TradePairReferenceData = {
    [coin: string]: {
        [exchange: string]: {
            [tradePair: string]: {
                makerFee: number,
                takerFee: number,
                riskLevels: {
                    type: SymbolType,
                    contractSize?: number,
                    levels: LeverageTier[]
                }
            }
        }
    }
}

export type CreateOrderDetails = {
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
    immediate?: boolean
}

export type AdjustPositionDetails = {
    longExchange: ccxt.pro.Exchange,
    shortExchange: ccxt.pro.Exchange,
    longSymbol: string,
    shortSymbol: string,
    makerSide: MakerSide,
    idealOrderValue: number,
    idealBatchSize?: number,
    shortSide?: Order["side"],
    longSide?: Order["side"],
    trailPct?: number,
    targetSize?: number,
    reduceOnly?: boolean
}

export type ExchangeTradeState = {
    exchange: string,
    symbol: string,
    riskIndex: number,
    maxLeverage: number,
    depositId?: string,
    depositTxId?: string,
    withdrawId?: string,
    withdrawTxId?: string
}

export type TradeState = {
    fundingHour: number,
    long: ExchangeTradeState,
    short: ExchangeTradeState,
    targetSize: number,
    state: 'open' | 'filled' | 'closed',
    makerSide: MakerSide,
    leverage: number
}

export type FundingRateCalculation = {
    exchange: string,
    symbol: string,
    rate: number,
    makerFee: number,
    takerFee: number,
    calculatedLeverage: number,
    maxLeverage: number,
    riskIndex: number
}

export type RoiTradePair = {
    roi: number,
    makerSide: MakerSide,
    longExchange: string,
    shortExchange: string,
    longSymbol: string,
    shortSymbol: string,
    longRiskIndex: number,
    shortRiskIndex: number,
    longMaxLeverage: number,
    shortMaxLeverage: number,
    leverage: number
}

export type LeverageTier = {
    maxLeverage: number,
    maxNotional: number,
    tier: number,
    currency: string,
    minNotional: number,
    maintenanceMarginRate: number,
    info: any
}

export type FundingRates = { [coin: string]: { [exchange: string]: { [pair: string]: number } } }