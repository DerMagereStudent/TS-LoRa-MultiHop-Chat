import { AtCmdOneLiner } from "./atcmdonel";

export class AtCmdAddr extends AtCmdOneLiner {
    constructor(addr: number) {
        super(`AT+ADDR=${addr}\r\n`);
    }
}