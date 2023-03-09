import { FetchOpenStopOrdersFunction, SetRiskLimitFunction } from "./types.js";
import ccxt, { Balances, Params } from 'ccxt';

const ignoreErrorCodes: {
    [errorCode: string]: {
        [message: string]: any
    }
} = {
    '10001': { 'risk limit not modified': {} },
    '10016': { 'Cancel All No Result': {} },
    '110043': { 'leverage not modified': {} },
    '110017': { 'current position is zero, cannot fix reduce-only order qty': {} },
};
export class BybitExchange extends ccxt.pro.bybit {
    describe() {
        return this.deepExtend(super.describe(), {
            'api': {
                'private': {
                    'get': {
                        'asset/v3/private/transfer/account-coins/balance/query': 0.84
                    }
                }
            }
        })
    }

    handleErrors(httpCode: any, reason: any, url: any, method: any, headers: any, body: any, response: any, requestHeaders: any, requestBody: any) {
        if (!response) return;
        const errorCode = this.safeString2(response, 'ret_code', 'retCode');
        const retMsg = this.safeString2(response, 'ret_msg', 'retMsg');

        if (errorCode && retMsg && (errorCode in ignoreErrorCodes) && (retMsg in ignoreErrorCodes[errorCode])) return ignoreErrorCodes[errorCode][retMsg];
        return super.handleErrors(httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody);
    }

    parseFundingBalance(response: any) {
        const result: any = {
            'info': response,
        };
        const responseResult = this.safeValue(response, 'result', {});
        const currencyList = this.safeValueN(responseResult, ['balance']);

        for (let i = 0; i < currencyList.length; i++) {
            const entry = currencyList[i];
            const account: any = this.account();
            account['total'] = this.safeString2(entry, 'total', 'walletBalance');
            account['free'] = this.safeStringN(entry, ['free', 'transferBalance', 'availableBalance']);
            account['used'] = this.safeString(entry, 'locked');
            const currencyId = this.safeStringN(entry, ['coin']);
            const code = this.safeCurrencyCode(currencyId);
            result[code] = account;
        }
        return this.safeBalance(result);
    }

    async fetchBalance(params?: Params): Promise<Balances> {
        if (params?.type === this.options.fundingAccount) {
            let response = await this.privateGetAssetV3PrivateTransferAccountCoinsBalanceQuery({ accountType: "FUND" });
            return this.parseFundingBalance(response);
        }
        return super.fetchBalance(params);
    }

    public fetchOpenStopOrders: FetchOpenStopOrdersFunction =
        async (symbol: string, since?: number, limit?: number, params?: ccxt.Params): Promise<ccxt.Order[]> => {
            return super.fetchOpenOrders(symbol, since, limit, params);
        }

    public setRiskLimit: SetRiskLimitFunction =
        async (riskLimit: number, symbol: string) => {
            let market = this.market(symbol);

            const response = await this.privatePostUnifiedV3PrivatePositionSetRiskLimit({
                category: "linear",
                symbol: market.id,
                riskId: riskLimit
            });
            return response;
        }
}
