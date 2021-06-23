import { ByteUtils } from "../../utils/byteutils";
import { Parsing } from "../../utils/parsing";

export class CaodvRREQ {
    type: number = 1;
    unknownSeq: boolean;
    hopCount: number;
    broadcastID: number;
    originAddr: number;
    originSeqNumber: number;
    destAddr: number;
    destSeqNumber: number;

    constructor(unknownSeq: boolean, hopCount: number, broadcastID: number, originAddr: number, originSeqNumber: number, destAddr: number, destSeqNumber: number) {
        this.unknownSeq = unknownSeq;
        this.hopCount = hopCount;
        this.broadcastID = broadcastID;
        this.originAddr = originAddr;
        this.originSeqNumber = originSeqNumber;
        this.destAddr = destAddr;
        this.destSeqNumber = destSeqNumber;
    }

    str(): string {
        return Parsing.bytesToStr([
            this.type,
            this.unknownSeq ? 1 : 0,
            this.hopCount,
            this.broadcastID,
            this.originAddr,
            ByteUtils.unsigned(this.originSeqNumber),
            this.destAddr,
            ByteUtils.unsigned(this.destSeqNumber)
        ]);
    }

    static parse(msg: string): CaodvRREQ | undefined {
        if (msg.length < 8)
            return undefined;

        var bytes = Parsing.strToBytes(msg, 0, 8);

        return new CaodvRREQ(
            bytes[1] == 1,
            bytes[2],
            bytes[3],
            bytes[4],
            ByteUtils.signed(bytes[5]),
            bytes[6],
            ByteUtils.signed(bytes[7])
        );
    }
}