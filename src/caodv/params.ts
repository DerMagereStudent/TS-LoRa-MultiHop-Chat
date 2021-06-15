
export class CaodvParams {
    static readonly MAX_TRIES: number = 3;
    static readonly TIMEOUT_ACK: number = 5000
    static readonly TIMEOUT_ACK_DEVIATION: number = 1000;
    static readonly ROUTE_LIFETIME: number = 3 * 60 * 1000;
    static readonly BLACKLIST_ENTRY_LIFETIME: number = 3 * 60 * 1000;
}