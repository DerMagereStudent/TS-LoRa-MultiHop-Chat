import { AtCmd, AtCmdState, AtCmdString } from "./atcmd";

export class ATCmdRst extends AtCmd {
    sent: boolean;
    sendAck: boolean;
    module: boolean;
    vendor: boolean;
    error: boolean;

    constructor() {
        super();
        this.sent = this.sendAck = this.module = this.vendor = this.error = false;
    }

    nextString() { return AtCmdString.AT_RST; }
    confirmSend() { this.sent = true; }

    processResponse(response: string) {
        if (!this.sendAck) {
            if (response.includes(AtCmdString.AT_OK))
                this.sendAck = true;
            else
                this.error = true;

            return !this.error;
        } else if (!this.module) {
            this.module = true;
            return true;
        }
        else {
            this.vendor = true;
            return true;
        }
    }

    state() {
        if (this.vendor || this.error)
            return AtCmdState.Finished | (!this.error ? AtCmdState.Success : 0);

        if (!this.sent)
            return AtCmdState.Send;

        return 0;
    }
}