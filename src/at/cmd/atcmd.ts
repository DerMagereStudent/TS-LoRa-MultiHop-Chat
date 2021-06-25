
export enum AtCmdState {
    Finished    = 0x00000001,
    Success     = 0x00000002,
    Send        = 0x00000004
}

export enum AtCmdString {
    AT_TEST = "AT\r\n",
    AT_RST = "AT+RST\r\n",
    AT_OK = "AT,OK",
    AT_SENDING = "AT,SENDING",
    AT_SENT = "AT,SENDED"
}

/**
 * The base class of every command that should be send to the himo module.
 */
export abstract class AtCmd {
    /**
     * @returns The next string of the command that should be sent. Should only be called, when state() returns a value having the ATC_STATE_SEND flag set
     */
    abstract nextString(): string;

    /**
     * Is called by the client to confirm the nextString() was written into the serial port. Changes nextString() to the next string which should be sent.
     */
    abstract confirmSend(): void;

    /**
     * Processes a response from the module and changes the state of the command to be finished, to expect another response or to send the next string.
     * @param response The response received from the module.
     * @returns True if this response was the expected one.
     */
    abstract processResponse(response: string): boolean;

    /**
     * @returns The current state of the command.
     */
    abstract state(): number;
}