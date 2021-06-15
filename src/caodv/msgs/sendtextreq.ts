import { ByteUtils } from "../../utils/byteutils";
import { Parsing } from "../../utils/parsing";

export class CaodvSendTextReq {
    type: number = 5;
    originAddr: number;
    destAddr: number;
    msgSeqNumber: number;
    payload: string;

    constructor(originAddr: number, destAddr: number, msgSeqNumber: number, payload: string) {
        this.originAddr = originAddr;
        this.destAddr = destAddr;
        this.msgSeqNumber = msgSeqNumber;
        this.payload = payload;
    }

    str(): string {
        return Parsing.bytesToStr([
            this.originAddr,
            this.destAddr,
            ByteUtils.unsigned(this.msgSeqNumber)
        ]) + this.payload;
    }

    static parse(msg: string): CaodvSendTextReq | undefined {
        if (msg.length < 5)
            return undefined;

        var bytes: number[] = Parsing.strToBytes(msg.slice(0, 4), 0, 4);

        return new CaodvSendTextReq(
            bytes[1],
            bytes[2],
            ByteUtils.signed(bytes[3]),
            msg.slice(4)
        );
    }
}