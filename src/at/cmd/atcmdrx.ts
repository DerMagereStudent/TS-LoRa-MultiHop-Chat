import { AtCmdOneLiner } from "./atcmdonel";

export class AtCmdRx extends AtCmdOneLiner {
    constructor() {
        super("AT+RX\r\n");
    }
}