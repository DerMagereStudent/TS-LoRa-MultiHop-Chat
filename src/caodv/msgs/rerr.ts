import { ByteUtils } from "../../utils/byteutils";
import { Parsing } from "../../utils/parsing";

export class CaodvRERR {
    type: number = 3;
    unreachableInfo: { addr: number, seq: number }[];

    constructor(unreachableInfo: { addr: number, seq: number }[]) {
        this.unreachableInfo = unreachableInfo;
    }

    str(): string {
        return  Parsing.bytesToStr(
            [
                this.type,
                this.unreachableInfo.length,
            ]
            .concat.apply([], this.unreachableInfo.map(e => [e.addr, ByteUtils.unsigned(e.seq)]))
        );
    }

    static parse(msg: string): CaodvRERR | undefined {
        if (msg.length < 4)
            return undefined;

        var bytes: number[] = Parsing.strToBytes(msg, 0, msg.length);

        var count: number = Math.max(bytes[1], 1);
        bytes = bytes.slice(2);

        count = Math.min(count, bytes.length % 2 === 0 ? bytes.length / 2 : (bytes.length - 1) / 2);
        var unreachableInfo: { addr: number, seq: number }[] = [];

        for (var i: number = 0; i < count; i++)
            unreachableInfo.push({ addr: bytes[i * 2], seq: ByteUtils.signed(bytes[i * 2 + 1])});

        return new CaodvRERR(unreachableInfo);
    }
}