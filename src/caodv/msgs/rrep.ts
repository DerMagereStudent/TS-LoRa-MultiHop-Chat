import { ByteUtils } from "../../utils/byteutils";
import { Parsing } from "../../utils/parsing";

export class CaodvRREP {
    type: number = 2;
    hopCount: number;
    originAddr: number;
    destAddr: number;
    destSeqNumber: number;
    remainingLifeTime: number;

    constructor(hopCount: number, originAddr: number, destAddr: number, destSeqNumber: number, remainingLifeTime: number) {
        this.hopCount = hopCount;
        this.originAddr = originAddr;
        this.destAddr = destAddr;
        this.destSeqNumber = destSeqNumber;
        this.remainingLifeTime = remainingLifeTime;
    }

    str(): string {
        return Parsing.bytesToStr([
            this.type,
            this.hopCount,
            this.originAddr,
            this.destAddr,
            ByteUtils.unsigned(this.destSeqNumber),
            Math.round(this.remainingLifeTime / 1000)
        ]);
    }

    static parse(msg: string): CaodvRREP | undefined {
        if (msg.length < 6)
            return undefined;

        var bytes: number[] = Parsing.strToBytes(msg, 0, 6);

        return new CaodvRREP(
            bytes[1],
            bytes[2],
            bytes[3],
            ByteUtils.signed(bytes[4]),
            bytes[5]
        );
    }
}