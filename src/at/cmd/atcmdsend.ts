import { AtCmd, AtCmdState, AtCmdString } from "./atcmd";

export class AtCmdSend extends AtCmd {
    addr: number;
    msg: string;

    addrSent: boolean;
    addrSendAck: boolean;
    prepSent: boolean;
    prepSendAck: boolean;
    dataSent: boolean;
    sending: boolean;
    sent: boolean;
    error: boolean;

    constructor(addr: number, msg: string) {
        super();
        if (msg == null || msg.length == 0) {
            this.addr = 0;
            this.msg = "";
            this.addrSent = this.addrSendAck = this.prepSent = this.prepSendAck = this.dataSent = this.sending = this.sent = this.error = true;
            return;
        }

        this.addr = addr;
        this.msg = msg;
        this.addrSent = this.addrSendAck = this.prepSent = this.prepSendAck = this.dataSent = this.sending = this.sent = this.error = false;
    }

    nextString() {
        return  !this.addrSent ? `AT+DEST=${this.addr > 0 ? this.addr : "FFFF"}\r\n` :
                    (!this.prepSent ?
                    `AT+SEND=${this.msg.length}\r\n` :
                    `${this.msg}\r\n`);
    }

    confirmSend() {
        if (!this.addrSent)
            this.addrSent = true;
        else if (!this.prepSent)
            this.prepSent = true;
        else
            this.dataSent = true;
    }

    processResponse(response: string) {
        if (!this.addrSendAck) {
            if (response.includes(AtCmdString.AT_OK))
                this.addrSendAck = true;
            else
                this.error = true;
        } else if (!this.prepSendAck) {
            if (response.includes(AtCmdString.AT_OK))
                this.prepSendAck = true;
            else
                this.error = true;
        } else if (!this.sending) {
            if (response.includes(AtCmdString.AT_SENDING))
                this.sending = true;
            else
                this.error = true;
        } else {
            if (response.includes(AtCmdString.AT_SENT))
                this.sent = true;
            else
                this.error = true;
        }

        return !this.error;
    }

    state() {
        if (this.sent || this.error)
            return AtCmdState.Finished | (!this.error ? AtCmdState.Success : 0);

        if (!this.addrSent || !this.prepSent || !this.dataSent && this.prepSendAck)
            return AtCmdState.Send;

        return 0;
    }
}