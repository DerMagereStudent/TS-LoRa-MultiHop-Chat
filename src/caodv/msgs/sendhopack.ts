import { ByteUtils } from "../../utils/byteutils";
import { Parsing } from "../../utils/parsing";

export class CaodvSendHopAck {
    type: number = 6;
    msgSeqNumber: number;

    constructor(msgSeqNumber: number) {
        this.msgSeqNumber = msgSeqNumber;
    }

    str(): string {
        return Parsing.bytesToStr([
            this.type,
            ByteUtils.unsigned(this.msgSeqNumber)
        ]);
    }

    static parse(msg: string): CaodvSendHopAck | undefined {
        if (msg.length < 2 || msg.length > 2)
            return undefined;

        var bytes: number[] = Parsing.strToBytes(msg, 0, 2);

        return new CaodvSendHopAck(ByteUtils.signed(bytes[1]));
    }
}