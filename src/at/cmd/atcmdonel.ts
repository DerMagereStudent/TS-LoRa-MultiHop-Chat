import { AtCmd, AtCmdState, AtCmdString } from "./atcmd";

/**
 * The class for at commands consisting of sending a command and receiving AT,OK.
 */
export class AtCmdOneLiner extends AtCmd {
    cmd: string;
    sent: boolean;
    sendAck: boolean;
    error: boolean;

    constructor(cmd: string) {
        super();

        // If cmd is invalid, cmd is finished with error immediately.
        if (cmd == null || cmd.length == 0) {
            this.cmd = "";
            this.sent = this.sendAck = this.error = true;
            return;
        }

        this.cmd = cmd;
        this.sent = this.sendAck = this.error = false;
    }

    nextString() { return this.cmd; }    
    confirmSend() { this.sent = true; }

    processResponse(response: string) {
        this.sendAck = true;

        if (!response.includes(AtCmdString.AT_OK))
            this.error = true;

        return !this.error;
    }

    state() {
        if (this.sendAck)
            return AtCmdState.Finished | (!this.error ? AtCmdState.Success : 0);

        if (!this.sent)
            return AtCmdState.Send;

        return 0;
    }
}