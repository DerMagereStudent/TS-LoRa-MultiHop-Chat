
export class CaodvParams {
    static readonly MAX_TRIES: number = 3;
    static readonly TIMEOUT_RREQ: number = 30000;
    static readonly TIMEOUT_ACK: number = 5000
    static readonly TIMEOUT_ACK_DEVIATION: number = 1000;
    static readonly ROUTE_LIFETIME_S: number = 3 * 60;
    static readonly ROUTE_LIFETIME: number = CaodvParams.ROUTE_LIFETIME_S * 1000;
    static readonly BLACKLIST_ENTRY_LIFETIME: number = 3 * 60 * 1000;
}