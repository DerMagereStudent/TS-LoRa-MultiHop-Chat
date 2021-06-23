import { ByteUtils } from "../../utils/byteutils";
import { Parsing } from "../../utils/parsing";

export class CaodvSendTextReqAck {
    type: number = 5;
    originAddr: number;
    destAddr: number;
    msgSeqNumber: number;

    constructor(originAddr: number, destAddr: number, msgSeqNumber: number) {
        this.originAddr = originAddr;
        this.destAddr = destAddr;
        this.msgSeqNumber = msgSeqNumber;
    }

    str(): string {
        return Parsing.bytesToStr([
            this.type,
            this.originAddr,
            this.destAddr,
            ByteUtils.unsigned(this.msgSeqNumber)
        ]);
    }

    static parse(msg: string): CaodvSendTextReqAck | undefined {
        if (msg.length < 4)
            return undefined;

        var bytes: number[] = Parsing.strToBytes(msg.slice(0, 4), 0, 4);

        return new CaodvSendTextReqAck(
            bytes[1],
            bytes[2],
            ByteUtils.signed(bytes[3])
        );
    }
}