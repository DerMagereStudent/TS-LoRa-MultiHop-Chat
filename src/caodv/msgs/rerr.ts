import { ByteUtils } from "../../utils/byteutils";
import { Parsing } from "../../utils/parsing";

export class CaodvRERR {
    type: number = 3;
    unreachableDestAddr: number;
    unreachableDestSeqNumber: number;
    additionalAddrs: number[];
    additionalSeqNumbers: number[];

    constructor(unreachableDestAddr: number, unreachableDestSeqNumber: number, additionalAddrs: number[], additionalSeqNumbers: number[]) {
        this.unreachableDestAddr = unreachableDestAddr;
        this.unreachableDestSeqNumber = unreachableDestSeqNumber;
        this.additionalAddrs = additionalAddrs;
        this.additionalSeqNumbers = additionalSeqNumbers;
    }

    str(): string {
        return  Parsing.bytesToStr(
            [
                this.type,
                1 + this.additionalAddrs.length,
                this.unreachableDestAddr,
                ByteUtils.unsigned(this.unreachableDestSeqNumber)
            ]
            .concat(this.additionalAddrs)
            .concat(this.additionalSeqNumbers.map(n => ByteUtils.unsigned(n)))
        );
    }

    static parse(msg: string): CaodvRERR | undefined {
        if (msg.length < 4)
            return undefined;

        var bytes: number[] = Parsing.strToBytes(msg, 0, msg.length);

        var count: number = bytes[1];
        var destAddr: number = bytes[2];
        var destSeqNumber: number = ByteUtils.signed(bytes[3]);

        bytes = bytes.slice(4);

        var addAddr: number[] = bytes.slice(0, count);

        if (addAddr.length < count)
            addAddr.concat(new Array(count - addAddr.length).fill(0));

        bytes = bytes.slice(count);

        var addSeqNumbers: number[] = bytes.slice(0, count).map(n => ByteUtils.signed(n));

        if (addSeqNumbers.length < count)
            addSeqNumbers.concat(new Array(count - addSeqNumbers.length).fill(0));

        return new CaodvRERR(destAddr, destSeqNumber, addAddr, addSeqNumbers);
    }
}