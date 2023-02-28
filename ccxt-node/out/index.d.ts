export {};
/**
let tradingState: TradeState = await getTradeState({ ssm, tradeStatusKey });

//need to initialize accounts before opening position
//  for margin call borrow from margin account
//need to finalize accounts aftore closing position
//  for margin call repay all borrowed amounts

//multiple trading selected pairs
//multiple concurrent position opening/closing orders
//recovery by waiting for opening closing orders to conclude


let settings: {
    tpSlLimit: number,
    tpSlTrigger: number,
    onBoardingHours: number,
    fundingHourlyFreq: number
} = {
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

        let {
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

        let fundingRates = await processFundingRatesPipeline([
            coinGlassLink/*
            filterCoins,
            kucoinRates,
            mexcRates,
            poloniexRates,
            xtRates
        */ 
