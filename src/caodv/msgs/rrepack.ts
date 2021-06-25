import { Parsing } from "../../utils/parsing"

export class RREPACK {
    type: number = 4

    str(): string {
        return Parsing.bytesToStr([4]);
    }
}