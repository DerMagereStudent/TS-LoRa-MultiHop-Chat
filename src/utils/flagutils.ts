
export class FlagUtils {
    static hasFlag(value: number, flag: number) {
        return (value & flag) == flag;
    }
}